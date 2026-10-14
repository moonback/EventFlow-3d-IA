import "@fontsource-variable/big-shoulders-stencil-display";
import "@fontsource-variable/jetbrains-mono";
import "./landing.css";
import { ArrowDown, ArrowRight, Boxes } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CUES } from "./cues";
import { CueConsole, CueHud, CueObserver, RevealObserver, StageBackdrop, TiltFrame } from "./stage-backdrop";

const NAV = [
  { href: "#conduite", label: "La conduite" },
  { href: "#plateau", label: "Le monde 3D" },
  { href: "#modules", label: "Modules" },
  { href: "#garanties", label: "Garanties" },
  { href: "#demarrer", label: "Démarrer" },
];

/** Mise en route réelle d'une agence (script d'amorçage, invitations, imports, formulaire public). */
const STEPS = [
  { title: "Votre organisation est créée", text: "Avec son compte propriétaire et les emplacements de base de l'entrepôt : stockage, préparation, retour, quarantaine, atelier." },
  { title: "Vous invitez l'équipe", text: "Chaque membre reçoit un lien d'invitation personnel et un rôle. Les techniciens et prestataires passent par leur portail, sans compte." },
  { title: "Vous importez l'existant", text: "Catalogue et clients en CSV, à partir d'un modèle fourni. Un aperçu signale les lignes en erreur avant tout import." },
  { title: "Vous ouvrez le formulaire", text: "Collez le code d'intégration sur votre site : les demandes arrivent directement dans le pipeline." },
];

const MODULE_GROUPS: { title: string; items: { name: string; text: string }[] }[] = [
  {
    title: "Commercial",
    items: [
      { name: "Demandes", text: "Formulaire de devis intégrable sur votre site, pipeline par étape, probabilité et motif de perte." },
      { name: "Clients", text: "Sociétés et particuliers, contacts, adresses de facturation et de livraison." },
      { name: "Événements", text: "Type, lieu, dates, responsable, tâches et notes de l'équipe." },
      { name: "Devis", text: "Versions successives, remises, TVA par taux, PDF prêt à envoyer." },
      { name: "Factures", text: "Émission numérotée, avoirs, paiements partiels, relances des échéances." },
    ],
  },
  {
    title: "Opérations",
    items: [
      { name: "Catalogue & stock", text: "Produits, unités sérialisées, emplacements, inventaires, seuils d'alerte." },
      { name: "Réservations", text: "Disponibilité calculée sur la période, tampons de préparation et de retour." },
      { name: "Logistique", text: "Préparation, expédition, retour contrôlé ligne par ligne." },
      { name: "Maintenance", text: "Matériel endommagé mis en quarantaine, réparé ou mis au rebut." },
      { name: "Véhicules", text: "Affectations, plan de chargement, entretiens, contrôles et assurances." },
      { name: "Équipe", text: "Compétences, coûts horaires, missions, relevés d'heures, portail prestataires." },
    ],
  },
  {
    title: "Gestion",
    items: [
      { name: "Achats", text: "Commandes fournisseurs et réceptions qui alimentent le stock." },
      { name: "Finances", text: "Marge prévue et réelle par événement, coûts d'équipe et de transport compris." },
      { name: "Rapports", text: "Indicateurs par période, exports CSV." },
      { name: "Documents", text: "Contrats, plans, fiches techniques rattachés au bon dossier." },
    ],
  },
];

const GUARANTEES = [
  { title: "Le stock ne passe jamais sous zéro", text: "Chaque solde est protégé par une contrainte en base de données : aucune sortie ne peut créer du matériel fantôme.", mechanism: "CHECK quantité ≥ 0" },
  { title: "Une facture émise ne bouge plus", text: "Montants, client, dates et lignes sont figés à l'émission. Une correction passe par un avoir.", mechanism: "Trigger PostgreSQL" },
  { title: "Aucun numéro ne saute", text: "Devis, factures et avoirs suivent une séquence continue par année, allouée dans la même transaction que le document.", mechanism: "FAC-2026-00001" },
  { title: "Les mouvements s'ajoutent, ne s'effacent pas", text: "Le journal de stock est en ajout seul. Une erreur se corrige par un mouvement inverse, visible de tous.", mechanism: "Journal append-only" },
  { title: "Chaque agence ne voit que ses données", text: "L'organisation vient de la session et est vérifiée à chaque appel, jamais du navigateur.", mechanism: "Isolation par organisation" },
  { title: "Les opérations sensibles sont tracées", text: "Changements de rôle, émissions, annulations : qui, quoi, quand, consultable par les administrateurs.", mechanism: "Journal d'audit" },
];

const ROLES = [
  { role: "Direction", sees: "Marges, rapports, planning global" },
  { role: "Commercial", sees: "Clients, devis, factures" },
  { role: "Responsable logistique", sees: "Réservations, préparation, véhicules" },
  { role: "Gestionnaire de stock", sees: "Catalogue, emplacements, inventaires" },
  { role: "Comptabilité", sees: "Factures, paiements, dépenses" },
  { role: "Technicien · Chauffeur · Équipe", sees: "Leurs missions et leur planning" },
  { role: "Prestataires", sees: "Un portail par lien, sans compte" },
];

const SHOTS = [
  { src: "/landing/simulation-chargement.jpg", title: "Simulation du chargement", text: "Le plan pas à pas, fond de caisse d'abord." },
  { src: "/landing/entrepot-chaleur.jpg", title: "Carte de chaleur", text: "Les emplacements les plus sollicités sur 90 jours." },
  { src: "/landing/frise-evenements.jpg", title: "Voyager dans le temps", text: "Les événements à venir, posés sur le terrain." },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/dashboard", label: "Ouvrir mon espace" } : { href: "/login", label: "Se connecter" };
  return (
    <div className="lp min-h-dvh">
      <CueObserver />
      <RevealObserver />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-30 bg-[linear-gradient(to_bottom,rgb(14_11_26/0.9),rgb(14_11_26/0.55)_60%,transparent)] backdrop-blur-[2px]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--lp-amber)] text-[#1b1206]">
              <Boxes className="size-4" aria-hidden />
            </span>
            <span className="lp-stencil text-xl">EventFlow 3D</span>
          </Link>
          <nav aria-label="Sections" className="ml-6 hidden items-center gap-6 text-sm text-[var(--lp-dim)] lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-[var(--lp-chalk)]">
                {n.label}
              </a>
            ))}
          </nav>
          <Link href={cta.href} className="lp-btn lp-btn-ghost ml-auto !h-10 !px-4 text-sm">
            {cta.label}
          </Link>
        </div>
      </header>

      <main>
        {/* ── Plateau 3D : ouverture + conduite ─────────────────── */}
        <div className="relative">
          <StageBackdrop />

          <section data-cue="-1" aria-labelledby="hero-title" className="relative z-10 flex min-h-dvh flex-col justify-end px-4 pb-6 pt-28 sm:px-8">
            <div className="mx-auto w-full max-w-[1400px]">
              <p className="lp-eyebrow lp-fade" style={{ "--i": 0 } as CSSProperties}>
                ERP · CRM · logistique — pour agences événementielles
              </p>
              <h1 id="hero-title" className="lp-stencil mt-5 text-[clamp(4.2rem,15vw,13.5rem)]">
                <span className="lp-rise lp-lit" style={{ "--i": 0 } as CSSProperties}>
                  Du devis
                </span>
                <span className="lp-rise lp-lit" style={{ "--i": 1 } as CSSProperties}>
                  au démontage.
                </span>
              </h1>
              <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <p className="lp-fade max-w-xl text-lg leading-relaxed text-[var(--lp-chalk)]/85 sm:text-xl" style={{ "--i": 2 } as CSSProperties}>
                  Matériel, équipes, véhicules, devis et factures dans une seule application. Et votre agence entière en 3D, pour voir où en est chaque
                  événement d&apos;un coup d&apos;œil.
                </p>
                <div className="lp-fade flex flex-wrap gap-3" style={{ "--i": 3 } as CSSProperties}>
                  <Link href={cta.href} className="lp-btn lp-btn-primary">
                    {cta.label} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <a href="#conduite" className="lp-btn lp-btn-ghost">
                    Suivre un événement <ArrowDown className="size-4" aria-hidden />
                  </a>
                </div>
              </div>
              <div className="lp-fade mt-14 border-t border-[var(--lp-line)] pt-4" style={{ "--i": 4 } as CSSProperties}>
                <CueHud />
              </div>
            </div>
          </section>

          <section id="conduite" aria-labelledby="conduite-title" className="relative z-10 px-4 pb-[30vh] pt-24 sm:px-8">
            <div className="mx-auto grid max-w-[1400px] lg:grid-cols-[1fr_minmax(0,560px)]">
              <div className="hidden lg:block">
                <div className="sticky top-[24vh] w-64">
                  <CueConsole />
                </div>
              </div>
              <div>
                <p className="lp-eyebrow">De J−45 à J+7 · {CUES.length} cues</p>
                <h2 id="conduite-title" className="lp-stencil mt-4 text-[clamp(3rem,8vw,6.5rem)]">
                  La conduite
                </h2>
                <p className="mt-5 max-w-md leading-relaxed text-[var(--lp-dim)]">
                  Un événement se déroule comme un spectacle : chaque étape déclenche la suivante. Faites défiler, les lyres suivent le programme.
                </p>
                <ol className="mt-[22vh] flex flex-col gap-[28vh]">
                  {CUES.map((cue, i) => (
                    <li key={cue.id}>
                      <article
                        data-cue={i}
                        className="lp-cue rounded-2xl border bg-[var(--lp-panel)] p-6 backdrop-blur-md sm:p-8"
                        style={{ "--cue-color": cue.light.colors[0] } as CSSProperties}
                        aria-labelledby={`cue-${cue.id}`}
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="lp-mono lp-cue-day text-3xl font-semibold transition-colors sm:text-4xl">{cue.day}</span>
                          <span className="lp-mono text-xs text-[var(--lp-dim)]">CUE {String(i + 1).padStart(2, "0")}</span>
                        </div>
                        <h3 id={`cue-${cue.id}`} className="mt-4 text-2xl font-semibold tracking-tight">
                          {cue.title}
                        </h3>
                        <p className="mt-3 leading-relaxed text-[var(--lp-chalk)]/75">{cue.text}</p>
                        <p className="mt-5 flex flex-wrap gap-2">
                          {cue.modules.map((m) => (
                            <span key={m} className="lp-mono rounded-full border border-[var(--lp-line)] px-3 py-1 text-[0.7rem] uppercase tracking-wider text-[var(--lp-dim)]">
                              {m}
                            </span>
                          ))}
                        </p>
                      </article>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        </div>

        {/* ── Le monde 3D ────────────────────────────────────────── */}
        <section id="plateau" aria-labelledby="plateau-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-28 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
              <div className="lp-reveal">
                <p className="lp-eyebrow">Mon univers 3D</p>
                <h2 id="plateau-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                  Votre agence en maquette
                </h2>
                <p className="mt-6 leading-relaxed text-[var(--lp-dim)]">
                  Bureaux, entrepôt, quais et événements en cours sont reconstitués à partir de vos données. Chaque rack, camion et chantier prend la couleur de
                  son état : normal, en activité, attention, alerte.
                </p>
                <p className="mt-4 leading-relaxed text-[var(--lp-dim)]">
                  Cliquez sur un camion pour afficher son plan de chargement, sur un emplacement pour voir son contenu. La même vue passe sur le mur
                  d&apos;écrans de l&apos;entrepôt.
                </p>
              </div>
              <TiltFrame className="lp-reveal">
                <figure className="overflow-hidden rounded-2xl border border-[var(--lp-line)] shadow-[0_40px_120px_-40px_rgb(156_140_255/0.55)]">
                  <Image src="/landing/monde-3d.jpg" alt="Vue d'ensemble du monde 3D : bureaux, entrepôt, zone logistique, événements et centre de contrôle" width={1600} height={1000} className="h-auto w-full" priority={false} />
                </figure>
              </TiltFrame>
            </div>
            <ul className="mt-16 grid gap-6 md:grid-cols-3">
              {SHOTS.map((s, i) => (
                <li key={s.src} className="lp-reveal" style={{ "--i": i } as CSSProperties}>
                  <figure>
                    <div className="overflow-hidden rounded-xl border border-[var(--lp-line)]">
                      <Image src={s.src} alt={s.title} width={1600} height={1000} className="h-auto w-full transition-transform duration-700 hover:scale-[1.04] motion-reduce:transition-none" />
                    </div>
                    <figcaption className="mt-3">
                      <span className="font-semibold">{s.title}</span>
                      <span className="block text-sm text-[var(--lp-dim)]">{s.text}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Modules ────────────────────────────────────────────── */}
        <section id="modules" aria-labelledby="modules-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-deck)] px-4 py-28 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="lp-reveal max-w-2xl">
              <p className="lp-eyebrow">Tout le métier, une seule base</p>
              <h2 id="modules-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                Ce qu&apos;il y a dans la caisse
              </h2>
            </div>
            <div className="mt-14 grid gap-10 lg:grid-cols-3">
              {MODULE_GROUPS.map((group, gi) => (
                <div key={group.title} className="lp-reveal" style={{ "--i": gi } as CSSProperties}>
                  <h3 className="lp-mono border-b border-[var(--lp-line)] pb-3 text-xs uppercase tracking-[0.2em] text-[var(--lp-amber)]">{group.title}</h3>
                  <dl className="divide-y divide-[var(--lp-line)]">
                    {group.items.map((m) => (
                      <div key={m.name} className="group py-4">
                        <dt className="font-semibold transition-colors group-hover:text-[var(--lp-amber)]">{m.name}</dt>
                        <dd className="mt-1 text-sm leading-relaxed text-[var(--lp-dim)]">{m.text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Garanties ──────────────────────────────────────────── */}
        <section id="garanties" aria-labelledby="garanties-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-28 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="lp-reveal grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="lp-eyebrow">Garanties en base de données</p>
                <h2 id="garanties-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                  Ce qui ne bouge pas
                </h2>
              </div>
              <p className="max-w-lg leading-relaxed text-[var(--lp-dim)] lg:justify-self-end">
                Ces règles ne dépendent pas de l&apos;écran ni de l&apos;utilisateur : elles sont appliquées par le serveur et la base de données, même en cas
                d&apos;erreur de saisie ou d&apos;accès simultané.
              </p>
            </div>
            <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-2 lg:grid-cols-3">
              {GUARANTEES.map((g, i) => (
                <li key={g.title} className="lp-reveal flex flex-col bg-[var(--lp-velvet)] p-7 transition-colors hover:bg-[#151027]" style={{ "--i": i % 3 } as CSSProperties}>
                  <span className="lp-mono text-[0.7rem] uppercase tracking-[0.16em] text-[var(--lp-amber)]">{g.mechanism}</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">{g.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--lp-dim)]">{g.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Rôles ──────────────────────────────────────────────── */}
        <section aria-labelledby="roles-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-deck)] px-4 py-28 sm:px-8">
          <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="lp-reveal">
              <p className="lp-eyebrow">Rôles et permissions</p>
              <h2 id="roles-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                Chacun son poste
              </h2>
              <p className="mt-6 leading-relaxed text-[var(--lp-dim)]">
                Onze rôles prêts à l&apos;emploi, des permissions ajustables par organisation. Le chauffeur voit ses tournées, pas les marges.
              </p>
            </div>
            <ul className="lp-reveal divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
              {ROLES.map((r) => (
                <li key={r.role} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="text-lg font-semibold">{r.role}</span>
                  <span className="lp-mono text-sm text-[var(--lp-dim)]">{r.sees}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Démarrer ───────────────────────────────────────────── */}
        <section id="demarrer" aria-labelledby="demarrer-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-28 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="lp-reveal max-w-2xl">
              <p className="lp-eyebrow">Mise en route</p>
              <h2 id="demarrer-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                Le montage
              </h2>
              <p className="mt-6 leading-relaxed text-[var(--lp-dim)]">Quatre étapes, dans cet ordre. Aucune donnée de démonstration dans votre organisation.</p>
            </div>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="lp-reveal relative flex flex-col bg-[var(--lp-velvet)] p-7" style={{ "--i": i } as CSSProperties}>
                  <span aria-hidden className="lp-stencil text-6xl text-[var(--lp-amber)]/90">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--lp-dim)]">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Rideau ─────────────────────────────────────────────── */}
        <section aria-labelledby="final-title" className="relative z-10 overflow-hidden border-t border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-32 sm:px-8">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[520px] max-w-4xl bg-[radial-gradient(ellipse_at_50%_0%,rgb(255_179_71/0.28),transparent_65%)]" />
          <div className="lp-reveal relative mx-auto max-w-[1400px] text-center">
            <p className="lp-eyebrow">Ce soir, 20 h</p>
            <h2 id="final-title" className="lp-stencil mt-5 text-[clamp(3.5rem,11vw,9.5rem)]">
              Lever de rideau
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-[var(--lp-dim)]">
              Le matériel est-il chargé, l&apos;équipe confirmée, le devis signé ? Ouvrez EventFlow, la réponse est sur le plateau.
            </p>
            <div className="mt-10 flex justify-center">
              <Link href={cta.href} className="lp-btn lp-btn-primary">
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 text-sm text-[var(--lp-dim)] sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="lp-stencil text-base text-[var(--lp-chalk)]">EventFlow 3D</span> — ERP et CRM pour agences événementielles
          </span>
          <Link href={cta.href} className="hover:text-[var(--lp-chalk)]">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
