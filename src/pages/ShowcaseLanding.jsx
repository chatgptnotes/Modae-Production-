import React from 'react'
import { Link } from 'react-router-dom'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import heroSensor from '../../assets/brand/modae/images/showcase-sensor-hero.png'
import sensors from '../../assets/brand/modae/images/products/sensors.jpg'
import monitoring from '../../assets/brand/modae/images/products/monitoring-systems.jpg'
import machinery from '../../assets/brand/modae/images/products/machinery-diagnostics.jpg'
import turbine from '../../assets/brand/modae/images/products/turbine-control.jpg'

const systems = [
  {
    title: 'Sensing at the edge',
    label: '01 · Condition monitoring',
    copy: 'High-resolution sensing that catches the signal before a small shift becomes a shutdown.',
    image: sensors,
  },
  {
    title: 'A clearer operating picture',
    label: '02 · Monitoring systems',
    copy: 'One connected view of the machines, risks, and decisions that move the operation forward.',
    image: monitoring,
  },
  {
    title: 'Diagnostics with direction',
    label: '03 · Machinery health',
    copy: 'Turn raw machine data into the next practical action for your engineering team.',
    image: machinery,
  },
  {
    title: 'Control where it matters',
    label: '04 · Turbine control',
    copy: 'Robust protection and control systems designed for demanding industrial environments.',
    image: turbine,
  },
]

const proof = [
  ['30+', 'years of industrial expertise'],
  ['40+', 'countries supported'],
  ['24/7', 'critical asset monitoring'],
]

export default function ShowcaseLanding() {
  return (
    <main className="showcase-landing min-h-[100dvh] overflow-hidden bg-[#F8F7F4] text-slate-900">
      <div className="showcase-noise" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex w-full max-w-[1480px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link to="/showcase" aria-label="ModAE showcase home">
          <ModaeImageLogo height={30} className="showcase-logo" />
        </Link>
        <div className="flex items-center gap-3">
          <a className="showcase-nav-link" href="mailto:hello@modae.com">
            Start a conversation <Icon name="arrowRight" size={15} />
          </a>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-[1480px] gap-9 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.06fr)_minmax(380px,.94fr)] lg:items-end lg:px-12 lg:pb-28 lg:pt-16">
        <div className="showcase-hero-copy max-w-3xl lg:pb-8">
          <p className="showcase-kicker">ModAE · Intelligent industrial systems</p>
          <h1 className="mt-5 max-w-[10ch] text-[clamp(3.7rem,8.1vw,8rem)] font-extrabold leading-[.86] tracking-[-.075em] text-slate-900">
            Systems that keep <span className="showcase-accent-word">industry</span> in motion.
          </h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            ModAE turns complex machinery into clear operating intelligence—so your team can see risk early, act with confidence, and keep critical assets productive.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a className="showcase-primary-cta" href="#systems">
              Explore systems <Icon name="arrowRight" size={17} />
            </a>
            <a className="showcase-secondary-cta" href="mailto:hello@modae.com">Talk to an engineer</a>
          </div>
        </div>

        <aside className="showcase-hero-card relative min-h-[470px] overflow-hidden rounded-2xl border border-white/10 bg-stone-900 shadow-[0_32px_90px_rgba(0,0,0,.38)] sm:min-h-[560px]">
          <img className="absolute inset-0 h-full w-full object-cover" src={heroSensor} alt="Precision industrial monitoring sensor" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-stone-200 backdrop-blur-sm">
            Built for the hard miles
          </div>
          <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-5 sm:inset-x-7 sm:bottom-7">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.17em] text-stone-400">Featured capability</p>
              <p className="mt-2 max-w-[13ch] text-2xl font-bold leading-none tracking-[-.04em] text-white sm:text-3xl">Continuous condition intelligence</p>
            </div>
            <a className="showcase-card-arrow" href="#systems" aria-label="Explore ModAE systems"><Icon name="arrowRight" size={20} /></a>
          </div>
        </aside>
      </section>

      <section className="showcase-proof relative z-10 border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1480px] divide-y divide-slate-200 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8 lg:px-12">
          {proof.map(([value, label]) => (
            <div key={label} className="py-7 sm:px-8 sm:first:pl-0 sm:last:pr-0">
              <strong className="block text-4xl font-extrabold tracking-[-.06em] text-slate-900">{value}</strong>
              <span className="mt-2 block text-sm text-slate-600">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="systems" className="relative z-10 mx-auto w-full max-w-[1480px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[1fr_minmax(330px,.65fr)] lg:items-end">
          <div>
            <p className="showcase-kicker">What we build</p>
            <h2 className="mt-4 max-w-[12ch] text-4xl font-extrabold leading-[.95] tracking-[-.06em] text-slate-900 sm:text-6xl">Engineered for the moment before failure.</h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-600 lg:justify-self-end">From the first sensor signal to the control room decision, every system is made to reduce uncertainty around the assets that matter most.</p>
        </div>

        <div className="showcase-gallery mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          {systems.map((system, index) => (
            <article key={system.title} className={`showcase-card group relative min-h-[390px] overflow-hidden rounded-2xl border border-white/10 bg-stone-900 shadow-[0_18px_42px_rgba(0,0,0,.18)] ${index === 0 || index === 3 ? 'lg:col-span-7' : 'lg:col-span-5'}`}>
              <img className="absolute inset-0 h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.045]" src={system.image} alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/5" />
              <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">{system.label}</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-[-.035em] text-white">{system.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-stone-300">{system.copy}</p>
                </div>
                <span className="showcase-card-arrow shrink-0" aria-hidden="true"><Icon name="arrowRight" size={19} /></span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1480px] px-5 pb-20 sm:px-8 lg:px-12 lg:pb-28">
        <div className="showcase-closing rounded-2xl border border-white/10 px-6 py-14 sm:px-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12 lg:px-14">
          <div>
            <p className="showcase-kicker">The next operational advantage</p>
            <h2 className="mt-4 max-w-[13ch] text-4xl font-extrabold leading-[.92] tracking-[-.06em] text-white sm:text-6xl">Bring your critical assets into focus.</h2>
          </div>
          <a className="showcase-primary-cta mt-8 lg:mt-0" href="mailto:hello@modae.com">Start a conversation <Icon name="arrowRight" size={17} /></a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-200 px-5 py-6 text-xs text-slate-600 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} ModAE. Industrial intelligence, made actionable.</span>
          <Link className="transition-colors hover:text-slate-900" to="/">Workspace sign in</Link>
        </div>
      </footer>
    </main>
  )
}
