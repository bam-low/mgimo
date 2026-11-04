import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
for(const width of [360,1280])test(`student → staff → approved at ${width}px`,async({page},info)=>{
 if(!process.env.DATABASE_URL?.split('?')[0].endsWith('_test'))throw Error('E2E must use a dedicated *_test DB');
 const password='Synthetic-'+randomUUID();const name='Тест-'+randomUUID().slice(0,8);const email=randomUUID()+'@example.test';
 await page.setViewportSize({width,height:900});await page.goto('/register');
 await page.getByLabel('Имя',{exact:true}).fill(name);await page.getByLabel('Фамилия',{exact:true}).fill('Вымышленный');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);
 await page.getByLabel('Университет',{exact:true}).selectOption('demo-university');await page.getByLabel('Факультет',{exact:true}).selectOption('faculty-1');await page.getByLabel('Направление',{exact:true}).selectOption('program-1');await page.getByLabel('Группа',{exact:true}).selectOption('group-1');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Создать учётную запись'}).click();await expect(page.getByRole('status')).toContainText('Проверьте данные');
 async function login(user:string,pass:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(user);await page.getByLabel('Пароль',{exact:true}).fill(pass);await page.getByRole('button',{name:'Войти',exact:true}).click();}
 await login(email,password);await expect(page.getByTestId('membership-status')).toHaveText('Ожидает подтверждения');expect((await page.request.get('/api/group')).status()).toBe(403);
 await page.getByRole('button',{name:'Выйти'}).click();await expect(page).toHaveURL(/\/login$/);
 if(!process.env.DEMO_STAFF_PASSWORD)throw Error('DEMO_STAFF_PASSWORD required');await login('staff@example.test',process.env.DEMO_STAFF_PASSWORD);
 const card=page.locator('.request').filter({hasText:name});await expect(card).toBeVisible();await card.getByLabel('Причина / комментарий').fill('Проверено на синтетических данных');await card.getByRole('button',{name:'Отправить'}).click();await expect(card).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Выйти'}).click();await expect(page).toHaveURL(/\/login$/);await login(email,password);await expect(page.getByTestId('membership-status')).toHaveText('Подтверждено');expect((await page.request.get('/api/group')).status()).toBe(200);
 expect((await page.request.get('/api/group?id=group-2')).status()).toBe(403);
 await page.screenshot({path:info.outputPath(`approved-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'Выйти'}).click();await expect(page).toHaveURL(/\/login$/);expect((await page.request.get('/api/group')).status()).toBe(401);
});
