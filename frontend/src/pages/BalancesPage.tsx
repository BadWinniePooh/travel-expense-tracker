import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ArrowRight, Plus, Trash2, Scale } from 'lucide-react'
import { getBalances, deleteRepayment } from '@/api/balances'
import { getUsers } from '@/api/users'
import { db } from '@/lib/db'
import { formatMoney } from '@/lib/formatMoney'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/Layout'
import { AddRepaymentDialog, type Person, type RepaymentPrefill } from '@/components/AddRepaymentDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function BalancesPage() {
  const { user, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const vacations = useLiveQuery(() => db.vacations.toArray())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['balances'],
    queryFn: getBalances,
  })

  // Admins can record repayments between anyone; everyone else picks from the
  // people they share vacations (or existing balances) with.
  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isAdmin,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<RepaymentPrefill | undefined>()

  const deleteMutation = useMutation({
    mutationFn: deleteRepayment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['balances'] }),
  })

  const people = useMemo<Person[]>(() => {
    const map = new Map<string, string>()
    if (isAdmin) {
      allUsers?.forEach((u) => map.set(u.id, u.username))
    } else {
      vacations?.forEach((v) => v.participants.forEach((p) => map.set(p.userId, p.username)))
      data?.pairs.forEach((p) => {
        map.set(p.debtorUserId, p.debtorUsername)
        map.set(p.creditorUserId, p.creditorUsername)
      })
    }
    return [...map.entries()]
      .map(([id, username]) => ({ id, username }))
      .sort((a, b) => a.username.localeCompare(b.username))
  }, [isAdmin, allUsers, vacations, data])

  const openDialog = (p?: RepaymentPrefill) => {
    setPrefill(p)
    setDialogOpen(true)
  }

  const currency = data?.currency ?? 'EUR'
  const me = user?.id ?? ''

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Balances</h1>
          <p className="text-muted-foreground mt-1">
            Who owes whom across all vacations{data ? ` (in ${currency})` : ''}
          </p>
        </div>
        <Button onClick={() => openDialog()} disabled={!data}>
          <Plus className="h-4 w-4 mr-2" />
          Add repayment
        </Button>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Loading balances...</div>}
      {isError && (
        <div className="text-center py-12 text-destructive">
          Could not load balances. Balances need a connection — please try again when you are online.
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding</CardTitle>
              <CardDescription>Net per pair, after all repayments</CardDescription>
            </CardHeader>
            <CardContent>
              {data.pairs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Scale className="h-8 w-8 mx-auto mb-2" />
                  All settled up.
                </div>
              ) : (
                <ul className="divide-y">
                  {data.pairs.map((pair) => {
                    const iOwe = pair.debtorUserId === me
                    const owedToMe = pair.creditorUserId === me
                    return (
                      <li
                        key={`${pair.debtorUserId}-${pair.creditorUserId}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{iOwe ? 'You' : pair.debtorUsername}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{owedToMe ? 'You' : pair.creditorUsername}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-semibold ${iOwe ? 'text-destructive' : owedToMe ? 'text-green-600' : ''}`}>
                            {formatMoney(pair.amount, currency)}
                          </span>
                          {(iOwe || owedToMe) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openDialog({
                                  direction: iOwe ? 'paid' : 'received',
                                  counterpartId: iOwe ? pair.creditorUserId : pair.debtorUserId,
                                  amount: pair.amount,
                                })
                              }
                            >
                              {iOwe ? 'Record payment' : 'Record received'}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repayments</CardTitle>
              <CardDescription>Payments already made back</CardDescription>
            </CardHeader>
            <CardContent>
              {data.repayments.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground">No repayments recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.repayments.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{r.fromUserId === me ? 'You' : r.fromUsername}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{r.toUserId === me ? 'You' : r.toUsername}</span>
                          <span className="font-semibold">{formatMoney(r.amount, r.currency)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {format(new Date(r.date), 'MMM d, yyyy')}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </div>
                      {(isAdmin || r.createdByUserId === me) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete repayment"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm('Delete this repayment? The balance will change accordingly.')) {
                              deleteMutation.mutate(r.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AddRepaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        currency={currency}
        currentUserId={me}
        isAdmin={isAdmin}
        people={people}
        prefill={prefill}
      />
    </Layout>
  )
}
