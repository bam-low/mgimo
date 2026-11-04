import Link from 'next/link';import {AuthForm} from '../forms';
export default function Page(){return <main className="panel"><Link href="/">Кампус</Link><h1>Регистрация студента</h1><p>Концепт, не официальный сервис</p><AuthForm register/><Link href="/login">Уже есть аккаунт? Войти</Link></main>}
