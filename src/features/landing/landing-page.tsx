import "@fontsource-variable/big-shoulders-stencil-display";
import "@fontsource-variable/jetbrains-mono";
import "./landing.css";
import { ArrowDown, ArrowRight, Check, ChevronDown, Crosshair, Database, Menu, Mic, MousePointerClick, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CUES } from "./cues";
import { CountUp, ScrollFader, SpotlightTracker } from "./landing-motion";
import { CueConsole, CueHud, CueObserver, RevealObserver, StageBackdrop, TiltFrame } from "./stage-backdrop";

const NAV = [
  { href: "#constat", label: "Pourquoi" },
  { href: "#conduite", label: "La conduite" },
  { href: "#plateau", label: "Le monde 3D" },
  { href: "#eric", label: "Eric" },
  { href: "#modules", label: "Modules" },
  { href: "#garanties", label: "Garanties" },
  { href: "#questions", label: "Questions" },
];

/** Ce que l'agence quitte, ce qu'elle trouve dans EventFlow (section « Le constat »). */
const BEFORE_AFTER = [
  { before: "Le stock dans un tableur que personne n'a mis à jour", after: "Un stock à jour à chaque mouvement, qui ne passe jamais sous zéro" },
  { before: "Les disponibilités de l'équipe dans un groupe WhatsApp", after: "Des missions acceptées sur le portail, sans création de compte" },
  { before: "Le devis sous Word, la facture dans un autre logiciel", after: "Devis versionné et facture numérotée dans le même dossier" },
  { before: "Le plan de chargement dans la tête du chauffeur", after: "Un plan de chargement calculé pour chaque véhicule" },
  { before: "La marge connue trois mois après l'événement", after: "La marge réelle dès le retour du matériel" },
];

const FIGURES = [
  { value: 16, label: "modules reliés à une seule base" },
  { value: 11, label: "rôles prêts à l'emploi" },
  { value: CUES.length, label: "étapes suivies, de la demande à la facture" },
  { value: 0, label: "double réservation de matériel" },
];

/** Bandeau défilant façon mur LED. */
const TICKER = ["Demandes", "Devis", "Réservations", "Préparation", "Chargement", "Show", "Retour", "Facture", "Marge réelle", "Monde 3D", "Eric"];

const FAQ = [
  {
    q: "Faut-il une machine puissante pour le monde 3D ?",
    a: "Non. La qualité s'adapte à l'appareil, et si la 3D n'est pas disponible, toutes les fonctions restent accessibles depuis les écrans classiques.",
  },
  {
    q: "Peut-on reprendre nos fichiers existants ?",
    a: "Oui. Catalogue et clients s'importent en CSV à partir d'un modèle fourni ; un aperçu signale les lignes en erreur avant tout import.",
  },
  {
    q: "Nos techniciens et prestataires doivent-ils créer un compte ?",
    a: "Non. Ils reçoivent un lien vers leur portail pour voir leurs missions, les accepter ou les refuser et déclarer leurs disponibilités.",
  },
  {
    q: "Eric peut-il modifier nos données sans nous ?",
    a: "Non. Il propose l'action (changer un statut, créer une tâche, déplacer du matériel) et rien n'est enregistré sans votre clic. Il ne voit que ce que votre rôle permet de voir.",
  },
  {
    q: "Fonctionne-t-il hors du navigateur ?",
    a: "Une application Windows est disponible en plus de la version web, avec les mêmes données.",
  },
  {
    q: "Les données d'une agence sont-elles séparées des autres ?",
    a: "Oui. L'organisation est déterminée par la session côté serveur et vérifiée à chaque appel, jamais transmise par le navigateur.",
  },
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
      { name: "Assistant vocal", text: "Eric répond à la voix sur vos données, montre la réponse en 3D et propose des actions à confirmer." },
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

/** Ce que fait Eric, l'assistant vocal (voir la section « Eric, à l'intercom ») */
const ERIC_SKILLS = [
  { icon: Mic, title: "Il vous écoute", text: "Conversation vocale en temps réel, en français. Coupez-lui la parole ou écrivez-lui : il suit." },
  { icon: Database, title: "Il connaît le dossier", text: "Événements, stock, véhicules, équipe, devis, factures, finances : il consulte vos données, jamais sa mémoire." },
  { icon: Crosshair, title: "Il montre", text: "Il cadre le camion, le rayonnage ou l'événement dont il parle, et va se placer à côté pour le désigner." },
  { icon: MousePointerClick, title: "Vous décidez", text: "Il peut changer un statut, ajouter une note, créer une tâche ou déplacer du matériel. Rien ne bouge sans votre clic." },
];

const SHOTS = [
  { src: "/landing/simulation-chargement.jpg", title: "Simulation du chargement", text: "Le plan pas à pas, fond de caisse d'abord." },
  { src: "/landing/entrepot-chaleur.jpg", title: "Carte de chaleur", text: "Les emplacements les plus sollicités sur 90 jours." },
  { src: "/landing/frise-evenements.jpg", title: "Voyager dans le temps", text: "Les événements à venir, posés sur le terrain." },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/dashboard", label: "Ouvrir mon espace" } : { href: "/register", label: "Créer mon agence" };
  const secondary = signedIn ? null : { href: "/login", label: "Se connecter" };
  return (
    <div className="lp min-h-dvh">
      <CueObserver />
      <RevealObserver />
      <SpotlightTracker />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <header data-lp-header className="lp-header fixed inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--lp-amber)]">
              <Image src="/Images/logo.png" alt="" width={32} height={32} className="size-full object-contain" priority />
            </span>
            <span className="lp-stencil hidden whitespace-nowrap text-xl min-[420px]:inline">EventFlow 3D</span>
          </Link>
          <nav aria-label="Sections" className="ml-6 hidden items-center gap-6 text-sm text-[var(--lp-dim)] lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-[var(--lp-chalk)]">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {secondary ? (
              <Link href={secondary.href} className="hidden px-3 text-sm text-[var(--lp-dim)] transition-colors hover:text-[var(--lp-chalk)] sm:inline">
                {secondary.label}
              </Link>
            ) : null}
            <Link href={cta.href} className="lp-btn lp-btn-primary !h-10 !px-4 text-sm">
              {cta.label}
            </Link>
            <details className="lp-menu relative lg:hidden">
              <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--lp-line)]">
                <Menu className="size-4" aria-hidden />
                <span className="sr-only">Menu</span>
              </summary>
              <nav aria-label="Sections (mobile)" className="absolute right-0 top-12 flex w-56 flex-col rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-deck)] p-2 shadow-2xl">
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-[var(--lp-dim)] hover:bg-white/5 hover:text-[var(--lp-chalk)]">
                    {n.label}
                  </a>
                ))}
                {secondary ? (
                  <Link href={secondary.href} className="mt-1 rounded-lg border-t border-[var(--lp-line)] px-3 py-2 text-sm hover:bg-white/5">
                    {secondary.label}
                  </Link>
                ) : null}
              </nav>
            </details>
          </div>
        </div>
        <ScrollFader />
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
                <div className="lp-fade max-w-xl" style={{ "--i": 2 } as CSSProperties}>
                  <p className="text-lg leading-relaxed text-[var(--lp-chalk)]/85 sm:text-xl">
                    Remplacez le tableur, le groupe WhatsApp et les devis sous Word par une seule application : matériel, équipes, véhicules, devis et
                    factures. Votre agence entière en 3D, et Eric, un régisseur virtuel qui vous répond à voix haute.
                  </p>
                  <ul className="lp-mono mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--lp-dim)]">
                    {["Aucune double réservation", "Marge réelle par événement", "Web et Windows"].map((t) => (
                      <li key={t} className="flex items-center gap-1.5">
                        <Check className="size-3.5 text-[var(--lp-amber)]" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lp-fade flex flex-wrap gap-3" style={{ "--i": 3 } as CSSProperties}>
                  <Link href={cta.href} className="lp-btn lp-btn-primary">
                    {cta.label} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <a href="#conduite" className="lp-btn lp-btn-ghost">
                    Voir un événement de bout en bout <ArrowDown className="size-4" aria-hidden />
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

        {/* ── Bandeau LED ─────────────────────────────────────────── */}
        <div className="relative z-10 overflow-hidden border-y border-[var(--lp-line)] bg-[var(--lp-deck)] py-5" aria-hidden>
          <div className="lp-ticker-track flex w-max">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center">
                {TICKER.map((t, i) => (
                  <li key={t} className="lp-stencil flex items-center pl-12 text-3xl sm:text-4xl" style={{ color: i % 3 === 0 ? "var(--lp-amber)" : undefined }}>
                    {t}
                    <span className="ml-12 inline-block size-1.5 rounded-full bg-[var(--lp-magenta)]" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* ── Le constat : avant / après ─────────────────────────── */}
        <section id="constat" aria-labelledby="constat-title" className="relative z-10 bg-[var(--lp-velvet)] px-4 py-28 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="lp-reveal grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="lp-eyebrow">Le constat</p>
                <h2 id="constat-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                  Fini le bricolage
                </h2>
              </div>
              <p className="max-w-lg leading-relaxed text-[var(--lp-dim)] lg:justify-self-end">
                Une agence événementielle jongle avec cinq outils qui ne se parlent pas. Chaque oubli se paie le jour du show : un câble manquant, un
                technicien absent, une marge qui fond.
              </p>
            </div>

            <div className="mt-14 overflow-hidden rounded-2xl border border-[var(--lp-line)]">
              <div aria-hidden className="lp-mono hidden grid-cols-2 border-b border-[var(--lp-line)] text-[0.7rem] uppercase tracking-[0.18em] md:grid">
                <span className="px-7 py-4 text-[var(--lp-dim)]">Aujourd&apos;hui</span>
                <span className="border-l border-[var(--lp-line)] px-7 py-4 text-[var(--lp-amber)]">Avec EventFlow 3D</span>
              </div>
              <ul className="divide-y divide-[var(--lp-line)]">
                {BEFORE_AFTER.map((row, i) => (
                  <li key={row.before} className="lp-reveal lp-swap grid md:grid-cols-2" style={{ "--i": i } as CSSProperties}>
                    <p className="flex items-start gap-3 px-7 pb-2 pt-6 text-[var(--lp-dim)] md:py-6">
                      <span className="lp-mono mt-0.5 text-xs text-[var(--lp-magenta)]" aria-hidden>
                        ✕
                      </span>
                      <span>
                        <span className="sr-only">Aujourd&apos;hui : </span>
                        <span className="lp-strike">{row.before}</span>
                      </span>
                    </p>
                    <p className="lp-after flex items-start gap-3 px-7 pb-6 pt-2 font-medium md:border-l md:border-[var(--lp-line)] md:py-6">
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--lp-amber)]" aria-hidden />
                      <span>
                        <span className="sr-only">Avec EventFlow 3D : </span>
                        {row.after}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <dl className="mt-20 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
              {FIGURES.map((f, i) => (
                <div key={f.label} className="lp-reveal flex flex-col-reverse justify-end border-t border-[var(--lp-line)] pt-5" style={{ "--i": i } as CSSProperties}>
                  <dt className="mt-3 max-w-[16rem] text-sm leading-relaxed text-[var(--lp-dim)]">{f.label}</dt>
                  <dd className="lp-stencil text-[clamp(4rem,9vw,7rem)]">
                    <CountUp to={f.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

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

        {/* ── Eric, l'assistant vocal ───────────────────────────── */}
        <section id="eric" aria-labelledby="eric-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-deck)] px-4 py-28 sm:px-8">
          <div className="mx-auto grid max-w-[1400px] gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-center">
            <div className="lp-reveal">
              <p className="lp-eyebrow">Assistant vocal · Gemini Live</p>
              <h2 id="eric-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                Eric, à l&apos;intercom
              </h2>
              <p className="mt-6 max-w-xl leading-relaxed text-[var(--lp-dim)]">
                Eric est le régisseur virtuel de votre agence. Casque sur les oreilles, il se tient dans le monde 3D : posez-lui une question à voix
                haute, il consulte vos données, vous répond en quelques secondes et montre la réponse sur le plateau.
              </p>
              <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
                {ERIC_SKILLS.map((skill, i) => (
                  <li key={skill.title} className="lp-reveal" style={{ "--i": i } as CSSProperties}>
                    <span className="flex size-10 items-center justify-center rounded-xl border border-[var(--lp-line)] bg-[var(--lp-panel)] text-[var(--lp-amber)]">
                      <skill.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight">{skill.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-dim)]">{skill.text}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-10 flex max-w-xl gap-3 border-t border-[var(--lp-line)] pt-5 text-sm leading-relaxed text-[var(--lp-dim)]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--lp-amber)]" aria-hidden />
                <span>
                  Eric ne voit que ce que votre rôle vous permet de voir, et chaque modification qu&apos;il propose attend votre confirmation. Votre voix
                  est traitée par Google Gemini.
                </span>
              </p>
            </div>

            {/* Conversation d'exemple (illustration, données de démonstration) */}
            <figure className="lp-reveal rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-5 shadow-[0_40px_120px_-40px_rgb(56_189_248/0.45)] backdrop-blur-md sm:p-6">
              <figcaption className="flex items-center gap-2.5 border-b border-[var(--lp-line)] pb-4">
                <span aria-hidden className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#22c55e] opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-[#22c55e]" />
                </span>
                <span className="font-semibold">Eric</span>
                <span className="lp-mono ml-auto text-[0.7rem] uppercase tracking-[0.16em] text-[var(--lp-dim)]">Exemple de conversation</span>
              </figcaption>
              <div className="mt-5 flex flex-col gap-3 text-sm leading-relaxed">
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-[var(--lp-lavender)] px-4 py-2.5 text-[#140f24]">
                  <span className="sr-only">Vous : </span>Où sont rangées les lyres spot ?
                </p>
                <p className="lp-mono self-start text-[0.7rem] uppercase tracking-wider text-[var(--lp-amber)]">Eric consulte le stock…</p>
                <p className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-[var(--lp-line)] bg-[var(--lp-velvet)] px-4 py-2.5">
                  <span className="sr-only">Eric : </span>Douze lyres spot : quatre en A-03, cinq au retour, deux en sortie et une en A-01. Je vous montre
                  l&apos;allée A.
                </p>
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-[var(--lp-lavender)] px-4 py-2.5 text-[#140f24]">
                  <span className="sr-only">Vous : </span>Passe le lancement Nova X en prêt à partir.
                </p>
                <div className="self-start rounded-xl border border-[var(--lp-amber)]/50 bg-[var(--lp-amber)]/10 p-3.5">
                  <p className="font-semibold">Eric propose : changer le statut de l&apos;événement</p>
                  <p className="mt-1 text-[var(--lp-dim)]">Lancement Nova X · Confirmé → Prêt à partir</p>
                  <p aria-hidden className="mt-3 flex gap-2">
                    <span className="rounded-lg bg-[var(--lp-amber)] px-3 py-1.5 text-xs font-semibold text-[#1b1206]">Confirmer</span>
                    <span className="rounded-lg border border-[var(--lp-line)] px-3 py-1.5 text-xs">Refuser</span>
                  </p>
                </div>
              </div>
            </figure>
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
                <div key={group.title} className="lp-reveal lp-spot rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-velvet)] p-6" style={{ "--i": gi } as CSSProperties}>
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
                <li key={g.title} className="lp-reveal lp-spot flex flex-col bg-[var(--lp-velvet)] p-7" style={{ "--i": i % 3 } as CSSProperties}>
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

        {/* ── Questions ──────────────────────────────────────────── */}
        <section id="questions" aria-labelledby="questions-title" className="relative z-10 border-t border-[var(--lp-line)] bg-[var(--lp-deck)] px-4 py-28 sm:px-8">
          <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="lp-reveal">
              <p className="lp-eyebrow">Avant de vous lancer</p>
              <h2 id="questions-title" className="lp-stencil mt-4 text-[clamp(3rem,7vw,5.5rem)]">
                Vos questions
              </h2>
              <p className="mt-6 leading-relaxed text-[var(--lp-dim)]">Ce que les agences demandent le plus souvent avant de créer leur organisation.</p>
            </div>
            <div className="lp-reveal divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
              {FAQ.map((item) => (
                <details key={item.q} className="lp-faq group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold transition-colors hover:text-[var(--lp-amber)]">
                    {item.q}
                    <ChevronDown className="size-5 shrink-0 text-[var(--lp-dim)] transition-transform duration-300 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="max-w-2xl pb-6 leading-relaxed text-[var(--lp-dim)]">{item.a}</p>
                </details>
              ))}
            </div>
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
              Le matériel est-il chargé, l&apos;équipe confirmée, le devis signé ? Ouvrez EventFlow ou demandez à Eric : la réponse est sur le plateau.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href={cta.href} className="lp-btn lp-btn-primary lp-btn-xl">
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {secondary ? (
                <Link href={secondary.href} className="lp-btn lp-btn-ghost lp-btn-xl">
                  {secondary.label}
                </Link>
              ) : null}
            </div>
            <p className="lp-mono mt-6 text-[0.72rem] uppercase tracking-[0.14em] text-[var(--lp-dim)]">
              Votre organisation, vide et prête à recevoir vos données
            </p>
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
