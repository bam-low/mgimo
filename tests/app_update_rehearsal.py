#!/usr/bin/env python3
"""Real app/PG/age/SSHSIG rehearsal on the disposable test-vps project only.
Systemd scheduling is adapted to this non-systemd runner. Signing keys and scan
metadata are explicitly synthetic fixtures, never release approval evidence.
"""
import copy
import hashlib
import importlib.util
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('app_update', ROOT/'ops/app-update/server.py')
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
f=s.fmt


def main(root, project):
    assert project.startswith('campus24-test-') and Path(root).name.startswith('campus-vps-test-')
    parent=Path(root)/'application-update'; parent.mkdir(mode=0o700)
    state=parent/'state'; state.mkdir(mode=0o700)
    backups=parent/'backups'; backups.mkdir(mode=0o700)
    export=parent/'export'; export.mkdir(mode=0o700)
    inbox=parent/'inbox'; inbox.mkdir(mode=0o700)
    cfg={'stateDir':str(state),'envFile':str(Path(root)/'release.env'),'compose':str(ROOT/'ops/vps/compose.yaml'),'project':project,'baselineManifest':str(parent/'baseline.json'),'sourceContract':str(parent/'contract.json'),'signers':str(parent/'allowed_signers'),'backupDir':str(backups),'exportDir':str(export),'inbox':str(inbox),'backupRecipients':str(parent/'recipients.txt')}

    class Isolated(s.Updater):
        WAIT_SECONDS=12
        active=['campus-backup.timer','campus-cleanup.timer','campus-monitor.timer']
        def timers(self): return list(self.active)
        def timer_action(self, action, timers):
            self.active=[] if action=='stop' else list(timers)
        def file_digests(self, paths):
            # Managed Docker may map the secret UID outside the runner UID. Read
            # real hashes via a network-none root fixture, never relax file modes.
            private=[p for p in paths if p.parent == Path(root)/'secrets']
            out=super().file_digests([p for p in paths if p not in private])
            if private:
                image='postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5'
                value=self.docker('run','--rm','--user','0','--network','none','-v',str(root)+':/test:ro','--entrypoint','sha256sum',image,*['/test/secrets/'+p.name for p in private]).decode().splitlines()
                assert len(value)==len(private)
                out.update({str(p):row.split()[0] for p,row in zip(private,value)})
            return out
        def publish_backup(self, source, destination):
            # Runner is non-root; actual encryption/backup/verification remains
            # the production implementation. Only export file ownership differs.
            shutil.copyfile(source,destination)

    age=os.environ.get('AGE_BIN','age'); keygen=os.environ.get('AGE_KEYGEN_BIN','age-keygen')
    subprocess.run([keygen,'-o',str(parent/'age.key')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    recipient=subprocess.check_output([keygen,'-y',str(parent/'age.key')],text=True).strip()
    (parent/'recipients.txt').write_text(recipient+'\n')
    Isolated.AGE_PROGRAM=age
    key=parent/'throwaway-signing-key'
    subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(key)],check=True)
    (parent/'allowed_signers').write_text(f.IDENTITY+' '+key.with_suffix('.pub').read_text())
    u=Isolated(cfg)
    env=u.env(); before=u.database()
    source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    c=f.contract(source)
    f.write(parent/'contract.json',{'sourceCommit':source,'contract':c})
    f.write(parent/'baseline.json',{'sourceCommit':source,'runtimeImage':env['CAMPUS_APP_IMAGE'],'databaseImage':env['CAMPUS_DB_IMAGE'],'toolsImage':env['CAMPUS_TOOLS_IMAGE'],'migrations':c['migrations']})
    target=u.initialize()
    f.write(ROOT/".runtime-evidence/app-update-target.json",target)
    def snapshot():
        code='''import pg from 'pg';import {createHash} from 'node:crypto';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query('BEGIN READ ONLY');const out={};for(const {tablename:t} of (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){if(!/^[A-Za-z_]+$/.test(t))throw Error('table');const rows=(await c.query('SELECT to_jsonb(t) AS row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;out[t]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}await c.query('ROLLBACK');await c.end();console.log(JSON.stringify(out));'''
        return json.loads(u.dc('run','--rm','-T','--no-deps','tools','node','--env-file=/run/secrets/migration.env','--input-type=module','-e',code))
    data_before=snapshot()
    images=[]
    def build(failing):
        tag='campus-app-update-test-'+secrets.token_hex(8)
        assert json.loads(u.docker('image','inspect','campus24-runtime'))[0]['Id']==env['CAMPUS_APP_IMAGE']
        dockerfile='FROM campus24-runtime\nLABEL io.campus.test="'+tag+'"\n'
        if failing: dockerfile+='CMD ["node","-e","process.exit(42)"]\n'
        u.docker('build','--network=none','-t',tag,'-',data=dockerfile.encode())
        image=json.loads(u.docker('image','inspect',tag))[0]['Id']; images.append(image)
        return image
    def bundle(image,t,sha):
        token=secrets.token_hex(16); path=inbox/token; path.mkdir(mode=0o700)
        save=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','image','save',image],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=u.command_env)
        with (path/'runtime.tar.gz').open('wb') as out:
            compress=subprocess.run(['gzip','-n'],stdin=save.stdout,stdout=out,check=True)
        save.stdout.close(); assert save.wait()==0
        security={'runtime':{'Metadata':{'ImageID':image,'OS':{'Family':'debian'}},'Results':[]},'scanner':{'scanner':{'Version':'0.76.2','VulnerabilityDB':{'SyntheticFixture':True}},'databaseFileSHA256':'a'*64},'npmProduction':{'metadata':{'vulnerabilities':{'total':0}}}}
        f.write(path/'runtime-security.json',security)
        f.write(path/'app-release.json',{'format':f.FORMAT,'sourceCommit':sha,'runtimeImage':image,'architecture':'linux/amd64','target':t,'securitySHA256':f.sha(path/'runtime-security.json'),'runId':'123'})
        (path/'SHA256SUMS').write_text(''.join(f.sha(path/n)+'  '+n+'\n' for n in sorted(f.FILES)))
        subprocess.run(['ssh-keygen','-Y','sign','-f',str(key),'-n',f.NAMESPACE,str(path/'SHA256SUMS')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        return token
    def apply(token):
        # Expected checksum arrives over the authenticated command, independently
        # of the writable upload directory, as in the real Windows client.
        return u.apply(token,f.sha(inbox/token/'SHA256SUMS'))
    results=[]
    try:
        good=build(False); bad=build(True)
        good_token=bundle(good,target,'2'*40)
        try: u.apply(good_token,'0'*64); raise AssertionError('Substituted signed package accepted')
        except ValueError as error: assert 'выбранного владельцем экспорта' in str(error)
        r=apply(good_token); assert r['status']=='UPDATED' and r['databaseUnchanged']
        assert u.database()==before and u.current_app()['Image']==good
        assert snapshot()==data_before
        backup=r['backup']; ciphertext=(export/backup['file']).read_bytes()
        plaintext=subprocess.check_output([age,'-d','-i',str(parent/'age.key')],input=ciphertext)
        assert plaintext.startswith(b'PGDMP') and hashlib.sha256(ciphertext).hexdigest()==backup['sha256']
        assert apply(good_token)['status']=='ALREADY_INSTALLED'
        results.append({'case':'success','status':'PASS','database':u.database(),'encryptedBackupDecryption':'PASS','allTableHashesUnchanged':True})
        time.sleep(1.05)
        bad_token=bundle(bad,target,'3'*40)
        r=apply(bad_token); assert r['status']=='ROLLED_BACK' and r['updateFailed']
        assert u.database()==before and u.current_app()['Image']==good
        assert snapshot()==data_before
        results.append({'case':'automatic-rollback','status':'PASS','database':u.database(),'allTableHashesUnchanged':True})
        # Signed incompatible target must not stop the running app or touch the DB.
        changed=copy.deepcopy(target); changed['databaseImage']='sha256:'+'f'*64
        token=bundle(good,changed,'4'*40)
        app_before=u.current_app()['Id']
        try: apply(token); raise AssertionError('Incompatible release accepted')
        except ValueError as error: assert 'полный сценарий' in str(error)
        assert u.database()==before and u.current_app()['Id']==app_before
        # Check actual image independently of the target equality check.
        saved=f.loads(u.state_path.read_bytes()); mutated=copy.deepcopy(saved); mutated['target']=changed; f.write(u.state_path,mutated)
        try:
            try: apply(token); raise AssertionError('Actual DB ID mismatch accepted')
            except ValueError as error: assert 'Фактический ID PostgreSQL' in str(error)
        finally: f.write(u.state_path,saved)
        # Actual migration ledger drift is detected before app stop.
        sql=b'''INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('app-update-fixture','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','20991101000000_test_drift',now(),now(),1);'''
        def query(sql): return u.dc('exec','-T','db','sh','-c','export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec psql -X -v ON_ERROR_STOP=1 -U campus_admin -d campus',data=sql)
        query(sql)
        try:
            try: apply(good_token); raise AssertionError('Migration drift accepted')
            except ValueError as error: assert 'журнал применённых миграций' in str(error)
        finally: query(b'''DELETE FROM "_prisma_migrations" WHERE id='app-update-fixture';''')
        original=u.envfile.read_bytes(); u.envfile.write_bytes(original.replace(b'CAMPUS_APP_PORT=18300',b'CAMPUS_APP_PORT=18301'))
        try:
            try: apply(good_token); raise AssertionError('Configuration drift accepted')
            except ValueError as error: assert 'конфигурация' in str(error)
        finally: u.envfile.write_bytes(original)
        assert u.database()==before and u.current_app()['Id']==app_before and snapshot()==data_before
        results.append({'case':'incompatible','status':'PASS','checks':['signed-target','actual-database-image','actual-migration-ledger','local-configuration'],'database':u.database(),'appContainerUnchanged':True,'allTableHashesUnchanged':True})
        r=u.rollback(); assert r['status']=='ROLLED_BACK'
        assert u.current_app()['Image']==env['CAMPUS_APP_IMAGE'] and u.database()==before
        assert snapshot()==data_before
        f.write(ROOT/'.runtime-evidence/app-update-rehearsal.json',{'status':'PASS','scope':'isolated application/PG orchestration; synthetic signing/scan fixtures; systemd scheduling adapted','sourceCommit':source,'databaseBefore':before,'cases':results,'manualRollback':'PASS','allTableHashes':data_before,'ownerVpsContacted':False})
        print('Проверено: обновление, автоматический откат, отказы и ручной откат; ID/StartedAt/RestartCount PostgreSQL не изменились')
    finally:
        # Only this rehearsal's app variants; never delete the release's three images.
        u.set_image(env['CAMPUS_APP_IMAGE']); u.dc('up','-d','--no-deps','--wait','app')
        for image in images: u.docker('image','rm',image)
        for secret in (key,key.with_suffix('.pub'),parent/'age.key'):
            if secret.exists(): secret.unlink()


if __name__=='__main__': main(*sys.argv[1:])
