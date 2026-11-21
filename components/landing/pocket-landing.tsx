import Link from 'next/link'
import { PocketScene, type Scene } from './pocket-scene'
import { PocketMotion } from './pocket-motion'
import './pocket.css'

const chapters = [
  { id: 'transactions', label: 'Transactions', title: 'Keep the', emphasis: 'little details.', description: 'Find the coffee, the train fare, or the transfer in your transaction history.', object: 'The paper trail', caption: 'The daily ledger', rows: [['Coffee', '−$4.50'], ['Train fare', '−$3.25']] },
  { id: 'reports', label: 'Reports', title: 'Where did', emphasis: 'it all go?', description: 'Look at spending by category, then open one to see the transactions behind it.', object: 'The breakdown', caption: 'Spending by category', rows: [['Food & drink', '$240'], ['Transport', '$120'], ['Other', '$120']] },
  { id: 'trips', label: 'Trips', title: 'One trip.', emphasis: 'Many tabs.', description: 'Keep a trip’s transactions and shared expenses together, from the first train to the last dinner.', object: 'The luggage tags', caption: 'Montréal weekend', rows: [['Dinner for two', '$86.00'], ['Your half', '$43.00']] },
  { id: 'investments', label: 'Investments', title: 'What’s in', emphasis: 'your mix?', description: 'See your holdings, review your allocation, and follow portfolio performance over time.', object: 'The portfolio', caption: 'Portfolio allocation', rows: [['Equities', '55%'], ['Funds', '35%'], ['Cash', '10%']] },
] satisfies { id: Scene; label: string; title: string; emphasis: string; description: string; object: string; caption: string; rows: string[][] }[]

function Login() {
  return <Link href="/sign-in" className="pocket-login">Log in <span aria-hidden="true">↗</span></Link>
}

function Chapter({ index }: { index: number }) {
  const chapter = chapters[index]
  return <section id={chapter.id} className="pocket-band" aria-labelledby={`${chapter.id}-heading`}>
    <div className="pocket-copy">
      <div className="pocket-kicker">0{index + 1} / {chapter.label}</div>
      <h2 id={`${chapter.id}-heading`}>{chapter.title}<br /><em>{chapter.emphasis}</em></h2>
      <p>{chapter.description}</p>
      <dl className="pocket-slip" aria-label={`${chapter.caption} example`}>{chapter.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <small>Illustrative figures</small>
    </div>
    <PocketScene scene={chapter.id} />
    <div className="pocket-foot"><span>0{index + 2} / {chapter.object}</span><span>{chapter.caption}</span></div>
  </section>
}

export function PocketLanding() {
  return <div className="pocket" id="pocket-guide">
    <header className="pocket-header">
      <span className="grov-wordmark">Grov<i aria-hidden="true" /></span>
      <nav aria-label="Pocket guide chapters">{chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}>{chapter.label}</a>)}</nav>
      <Login />
    </header>
    <div className="pocket-opening">
      <section id="wallet" className="pocket-band" aria-labelledby="wallet-heading">
        <div className="pocket-copy">
          <div className="pocket-kicker">A pocket guide to Grov</div>
          <h1 id="wallet-heading">Small change.<br /><em>Big picture.</em></h1>
          <p>See what you own, what you owe, and where your money goes.</p>
          <Login />
        </div>
        <PocketScene scene="wallet" />
        <div className="pocket-foot"><span>01 / The pocket wallet</span><a href="#transactions">Scroll to unpack ↓</a></div>
      </section>
      <Chapter index={0} />
      <svg className="pocket-flight" aria-hidden="true" focusable="false"><g><use href="/pocket-objects.svg#receipt" /></g></svg>
    </div>
    {chapters.slice(1).map((chapter, index) => <Chapter key={chapter.id} index={index + 1} />)}
    <footer className="pocket-close"><div><div className="pocket-kicker">Back in your pocket</div><h2>Your money awaits.</h2></div><Login /></footer>
    <PocketMotion />
  </div>
}
