import {
  ArrowRight,
  Cloud,
  LogOut,
  ShieldCheck,
  TabletSmartphone,
} from 'lucide-react';
import Link from 'next/link';

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from './chatgpt-auth';

export const dynamic = 'force-dynamic';

function PitMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-16 w-16 sm:h-[72px] sm:w-[72px]"
      viewBox="0 0 80 80"
      fill="none"
    >
      <path
        d="M10 19.5 40 6l30 13.5-7.8 44.8L40 74 17.8 64.3 10 19.5Z"
        fill="#FFF8E8"
        stroke="#16324A"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m18 25 22-9.7L62 25l-5.5 31.7L40 64l-16.5-7.3L18 25Z"
        stroke="#EE8A12"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m26 31 14-6.2L54 31l-3.3 18.5L40 54.2l-10.7-4.7L26 31Z"
        stroke="#16324A"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m33.5 36.8 6.5-2.9 6.5 2.9-1.4 7.8L40 46.8l-5.1-2.2-1.4-7.8Z"
        fill="#20A39E"
      />
    </svg>
  );
}

export default async function Home() {
  const user = await getChatGPTUser();

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f4f8fb] text-[#16324a]">
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[#e5f4f3] blur-3xl" />
        <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full bg-[#fff0d7] blur-3xl" />
        <svg className="absolute inset-x-0 bottom-0 h-[42vh] w-full opacity-45" viewBox="0 0 1440 430" preserveAspectRatio="none">
          <path d="M-70 365C172 183 343 481 614 280s432 30 581-93 247-95 330-88" stroke="#9ab9c8" strokeWidth="1.4" fill="none" />
          <path d="M-86 403C157 221 331 521 628 315s439 39 590-88 249-97 329-91" stroke="#b4cbd6" strokeWidth="1.2" fill="none" />
          <path d="M-44 323C186 149 350 431 598 240s416 21 563-91 236-89 314-85" stroke="#d8ad6f" strokeWidth="1.2" fill="none" />
        </svg>
      </div>

      <header className="relative z-10 flex h-20 items-center justify-between border-b border-[#ccdae3]/90 bg-white/80 px-5 backdrop-blur-xl sm:px-10 lg:px-14">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#c7d7e0] bg-white shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 40 40" className="h-8 w-8" fill="none">
              <path d="M5 10 20 3l15 7-4 22-11 5-11-5L5 10Z" stroke="#16324A" strokeWidth="2" strokeLinejoin="round" />
              <path d="m10 13 10-4.5L30 13l-2.5 14.5L20 31l-7.5-3.5L10 13Z" stroke="#EE8A12" strokeWidth="2" strokeLinejoin="round" />
              <path d="m15 17 5-2.2 5 2.2-1.2 6.5L20 25l-3.8-1.5L15 17Z" fill="#20A39E" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-bold leading-none tracking-[-0.02em]">GeoMine</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#657e91]">GIS · CAD · Planejamento de mina</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#bdd3df] bg-white px-3 py-2 text-xs font-semibold text-[#47677c] shadow-sm">
          <ShieldCheck className="size-4 text-[#14847f]" />
          Acesso privado
        </div>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl items-center gap-10 px-5 py-10 sm:px-10 lg:grid-cols-[1.08fr_.92fr] lg:px-14 lg:py-16">
        <div className="max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#bed9d7] bg-[#edf8f7] px-3 py-1.5 text-xs font-semibold text-[#157873]">
            <Cloud className="size-4" />
            Ambiente protegido na nuvem
          </div>
          <div className="flex items-center gap-5">
            <PitMark />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#ee8a12]">GeoMine Web</p>
              <h1 className="mt-1 text-[clamp(2.4rem,7vw,4.8rem)] font-bold leading-[0.9] tracking-[-0.045em] text-[#16324a]">Seu projeto,<br />onde estiver.</h1>
            </div>
          </div>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#587184] sm:text-lg sm:leading-8">
            Acesse as ferramentas de GIS, CAD e planejamento de mina em um ambiente autenticado. Seus arquivos de trabalho continuam sob seu controle no dispositivo.
          </p>

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-[#c8d8e1] bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf6f5] text-[#14847f]"><ShieldCheck className="size-5" /></div>
              <div><p className="text-sm font-bold">Login obrigatório</p><p className="mt-0.5 text-xs text-[#6d8393]">Sessão validada pelo servidor</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#c8d8e1] bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff4e3] text-[#d87100]"><TabletSmartphone className="size-5" /></div>
              <div><p className="text-sm font-bold">Pronto para tablet</p><p className="mt-0.5 text-xs text-[#6d8393]">Abra direto no navegador</p></div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-[28px] border border-[#c4d5df] bg-white p-6 shadow-[0_28px_80px_rgba(22,50,74,.15)] sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee8a12]">Portal seguro</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em]">{user ? 'Acesso liberado' : 'Entrar no GeoMine'}</h2>
            </div>
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf8f7] text-[#14847f]"><ShieldCheck className="size-6" /></div>
          </div>

          {user ? (
            <>
              <div className="rounded-2xl border border-[#d4e0e7] bg-[#f7fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#718897]">Conectado como</p>
                <p className="mt-1 truncate text-base font-bold">{user.displayName}</p>
                <p className="mt-0.5 truncate text-sm text-[#657e91]">{user.email}</p>
              </div>
              <Link href="/geomine/GeoMine.html" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1477bd] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(20,119,189,.25)] transition hover:bg-[#1069a8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1477bd]/25">
                Abrir GeoMine <ArrowRight className="size-4" />
              </Link>
              <a href={chatGPTSignOutPath('/')} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#c6d6df] px-4 py-2.5 text-sm font-semibold text-[#47677c] transition hover:bg-[#f3f7f9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1477bd]/15">
                <LogOut className="size-4" /> Sair desta conta
              </a>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-[#617a8c]">A autenticação acontece antes de o aplicativo ser entregue. Nenhuma senha é armazenada dentro do arquivo HTML.</p>
              <a href={chatGPTSignInPath('/')} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1477bd] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(20,119,189,.25)] transition hover:bg-[#1069a8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1477bd]/25">
                Entrar com segurança <ArrowRight className="size-4" />
              </a>
              <p className="mt-4 text-center text-xs leading-5 text-[#8193a0]">Somente contas autorizadas conseguem acessar o ambiente publicado.</p>
            </>
          )}

          <div className="mt-6 border-t border-[#dbe5ea] pt-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#5f788a]"><span className="size-2 rounded-full bg-[#25a879]" />Conexão protegida por HTTPS</div>
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#5f788a]"><span className="size-2 rounded-full bg-[#25a879]" />Acesso restrito no servidor</div>
          </div>
        </div>
      </section>
    </main>
  );
}
