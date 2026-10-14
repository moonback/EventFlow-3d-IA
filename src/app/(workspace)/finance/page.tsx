import Link from "next/link";
import { DonutChart, MonthlyFinanceChart } from "@/components/charts/charts";
import { PageHeader } from "@/components/feedback/page-header";
import { StatCard } from "@/components/feedback/stat-card";
import { Alert } from "@/components/feedback/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddExpenseDialog } from "@/features/events/components/event-dialogs";
import { formatDate } from "@/lib/dates";
import { eventStatusLabels, expenseCategoryLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { firstParam } from "@/lib/pagination";
import { isDay, localDayToUtc, periodPresets } from "@/lib/periods";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { financeOverview, monthlySeries } from "@/server/services/finance-service";
import { listExpenses } from "@/server/services/invoice-service";
import { PeriodPicker } from "./period-picker";

export const metadata = { title: "Finances" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext("finance:read");
  const sp = await searchParams;
  const tz = ctx.organization.timezone;
  const presets = periodPresets(tz);
  const fromDay = isDay(firstParam(sp.from)) ? firstParam(sp.from)! : presets[2]!.from;
  const toDay = isDay(firstParam(sp.to)) ? firstParam(sp.to)! : presets[2]!.to;
  const from = localDayToUtc(fromDay, tz);
  const to = localDayToUtc(toDay, tz);
  const [o, monthly, expenses] = await Promise.all([financeOverview(ctx, from, to), monthlySeries(ctx), listExpenses(ctx, { page: 1, pageSize: 50, dir: "desc", from, to })]);
  const t = o.totals;
  return (
    <>
      <PageHeader title="Finances & rentabilité" description="Indicateurs de gestion calculés à partir des devis, factures, paiements, affectations et dépenses (HT sauf mention). Ce module ne remplace pas une comptabilité générale." actions={can(ctx, "expenses:write") ? <AddExpenseDialog /> : null} />
      <div className="mb-4">
        <PeriodPicker from={fromDay} to={toDay} presets={presets} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CA prévisionnel (devis acceptés)" value={formatMoney(t.revenueForecast)} hint={`Négociation : ${formatMoney(t.revenuePipeline)}`} tone="accent" />
        <StatCard label="CA facturé net (période)" value={formatMoney(t.invoicedExclTax)} hint={`Encaissé : ${formatMoney(t.paymentsReceived)} TTC`} tone="success" />
        <StatCard label="Marge prévisionnelle" value={formatMoney(t.marginForecast)} hint={`Coût prévu ${formatMoney(t.costForecast)}`} tone={Number(t.marginForecast) >= 0 ? "success" : "danger"} />
        <StatCard label="Créances" value={formatMoney(t.receivables)} hint={`dont en retard : ${formatMoney(t.overdueReceivables)}`} tone={Number(t.overdueReceivables) > 0 ? "danger" : "neutral"} href="/invoices?overdue=true" />
        <StatCard label="Marge réelle" value={formatMoney(t.marginActual)} hint={`Coût réel ${formatMoney(t.costActual)}`} tone={Number(t.marginActual) >= 0 ? "success" : "danger"} />
        <StatCard label="Main-d'œuvre prévue" value={formatMoney(t.laborPlanned)} />
        <StatCard label="Transport" value={formatMoney(t.transportCost)} />
        <StatCard label="Dépenses & achats reçus" value={formatMoney(t.expenses)} hint={`Achats réceptionnés : ${formatMoney(t.purchases)}`} />
      </div>
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Par événement ({o.events.length})</TabsTrigger>
          <TabsTrigger value="customers">Par client</TabsTrigger>
          <TabsTrigger value="trend">Tendance 12 mois</TabsTrigger>
          <TabsTrigger value="expenses">Dépenses ({expenses.total})</TabsTrigger>
          <TabsTrigger value="formulas">Formules</TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Événement</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">CA prévu</TableHead>
                  <TableHead className="text-right">CA facturé</TableHead>
                  <TableHead className="text-right">Coût prévu</TableHead>
                  <TableHead className="text-right">Coût réel</TableHead>
                  <TableHead className="text-right">Marge prévue</TableHead>
                  <TableHead className="text-right">Marge réelle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                        {e.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {e.customer} · {eventStatusLabels[e.status]}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(e.startAt, tz)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(e.revenueForecast)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(e.revenueInvoiced)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(e.costForecast)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(e.costActual)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(e.marginForecast) < 0 ? "text-destructive" : ""}`}>
                      {formatMoney(e.marginForecast)} <span className="text-xs text-muted-foreground">{e.marginRateForecast ? `${e.marginRateForecast} %` : ""}</span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(e.marginActual) < 0 ? "text-destructive" : ""}`}>{formatMoney(e.marginActual)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="customers">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Événements</TableHead>
                    <TableHead className="text-right">CA prévu</TableHead>
                    <TableHead className="text-right">CA facturé</TableHead>
                    <TableHead className="text-right">Marge prévue</TableHead>
                    <TableHead className="text-right">Marge réelle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.customers.map((c) => (
                    <TableRow key={c.customerId}>
                      <TableCell>
                        <Link href={`/customers/${c.customerId}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{c.events}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.revenueForecast)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.revenueInvoiced)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.marginForecast)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.marginActual)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Répartition du CA prévisionnel</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart valueFormat="money" data={o.customers.filter((c) => Number(c.revenueForecast) > 0).map((c) => ({ name: c.name, value: Number(c.revenueForecast) }))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="trend">
          <Card>
            <CardContent className="pt-5">
              <MonthlyFinanceChart data={monthly} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expenses">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Rattachement</TableHead>
                    <TableHead className="text-right">Montant HT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.items.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>{formatDate(x.incurredAt, tz)}</TableCell>
                      <TableCell>{x.description}</TableCell>
                      <TableCell>{expenseCategoryLabels[x.category]}</TableCell>
                      <TableCell className="text-xs">
                        {x.event ? (
                          <Link href={`/events/${x.event.id}`} className="hover:underline">
                            {x.event.reference}
                          </Link>
                        ) : x.vehicle ? (
                          <Link href={`/vehicles/${x.vehicle.id}`} className="hover:underline">
                            {x.vehicle.registration}
                          </Link>
                        ) : (
                          "Frais généraux"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(x.amountExclTax)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Par catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart valueFormat="money" data={o.expensesByCategory.map((e) => ({ name: expenseCategoryLabels[e.category], value: Number(e.amount) }))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="formulas">
          <Alert tone="info" title="Méthode de calcul (HT)">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>CA prévisionnel = somme des devis acceptés rattachés aux événements de la période.</li>
              <li>CA facturé = factures émises − avoirs émis ; encaissements = paiements enregistrés (TTC).</li>
              <li>Main-d&apos;œuvre prévue = durée des affectations × coût horaire figé ; réalisée = heures pointées × coût horaire.</li>
              <li>Transport = jours entamés × coût/jour du véhicule + km × coût/km.</li>
              <li>Coût prévu = coût estimé saisi sur l&apos;événement, à défaut main-d&apos;œuvre prévue + transport + dépenses.</li>
              <li>Coût réel = main-d&apos;œuvre réalisée (ou prévue sans pointage) + transport + dépenses + pertes × valeur de remplacement.</li>
              <li>Marge = CA − coût ; taux de marge = marge / CA. Arrondis au centime (décimal exact).</li>
            </ul>
          </Alert>
        </TabsContent>
      </Tabs>
    </>
  );
}
