import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { computeSummary } from '@/lib/summary'
import { sortExpenses, filterExpenses, SORT_COLUMNS, type ExpenseSortField } from '@/lib/expenseTable'
import { redistributeSplit } from '@/lib/splitRedistribution'
import {
  createExpenseLocal, updateExpenseLocal, deleteExpenseLocal,
  addParticipantLocal, updateParticipantLocal, removeParticipantLocal,
  deleteVacationLocal,
} from '@/lib/localMutations'
import { getUsers } from '@/api/users'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { ArrowLeft, Plus, Trash2, Edit2, ArrowRight, ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import type { ExpenseCategory } from '@/types'

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Accommodation', 'Food', 'Transport', 'Activities', 'Shopping', 'Healthcare', 'Other',
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK']

export function VacationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAuth()
  const { pendingCount } = useSync()
  const navigate = useNavigate()

  const vacation = useLiveQuery(() => db.vacations.get(id!), [id])
  const expenses = useLiveQuery(
    () => db.expenses.where('vacationId').equals(id!).toArray().then(list =>
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    ),
    [id]
  )
  // Computed locally from IndexedDB expenses so totals and fair share always
  // reflect the current local state on reload, even before/without a server sync.

  // Users list is admin-only and not needed offline — keep as server query
  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isAdmin,
  })

  // Expense dialog state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    paidByUserId: '',
    amount: '',
    currency: 'EUR',
    description: '',
    category: 'Other' as ExpenseCategory,
    date: new Date().toISOString().split('T')[0],
  })
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [splitMode, setSplitMode] = useState<'default' | 'custom'>('default')
  const [splitWeights, setSplitWeights] = useState<Record<string, string>>({})

  // Participant dialog
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false)
  const [participantUserId, setParticipantUserId] = useState('')
  const [participantWeight, setParticipantWeight] = useState(50)
  const [editParticipantId, setEditParticipantId] = useState<string | null>(null)
  const [participantSubmitting, setParticipantSubmitting] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Expense table view state — purely cosmetic, never affects summary calculations
  // (those always run against the full, unfiltered `expenses` list).
  const [expenseSearch, setExpenseSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all')
  const [paidByFilter, setPaidByFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<ExpenseSortField>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // vacation === undefined means Dexie hasn't loaded yet; null/missing means not found
  if (vacation === undefined) {
    return (
      <Layout>
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </Layout>
    )
  }

  if (!vacation) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Vacation not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">Go back</Link>
          </Button>
        </div>
      </Layout>
    )
  }

  const isCreator = vacation.createdBy === user?.id
  const canManage = isAdmin || isCreator
  const nonParticipantUsers = allUsers?.filter(
    (u) => !vacation.participants.some((p) => p.userId === u.id)
  ) ?? []

  const vacationDefaultSplit = (): Record<string, string> =>
    Object.fromEntries(vacation.participants.map(p => [p.userId, String(p.splitWeight)]))

  const resetExpenseForm = () => {
    setExpenseForm({
      paidByUserId: vacation.participants.find(p => p.userId === user?.id)?.userId
        ?? vacation.participants[0]?.userId
        ?? '',
      amount: '',
      currency: vacation.baseCurrency,
      description: '',
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
    })
    setSplitMode('default')
    setSplitWeights(vacationDefaultSplit())
  }

  const handleOpenExpenseDialog = (expenseId?: string) => {
    if (expenseId) {
      const exp = expenses?.find((e) => e.id === expenseId)
      if (exp) {
        setExpenseForm({
          paidByUserId: exp.paidByUserId,
          amount: String(exp.amount),
          currency: exp.currency,
          description: exp.description,
          category: exp.category as ExpenseCategory,
          date: exp.date.split('T')[0],
        })
        setEditExpense(expenseId)
        if (exp.isSplitCustom && exp.splits.length > 0) {
          setSplitMode('custom')
          setSplitWeights(Object.fromEntries(exp.splits.map(s => [s.userId, String(s.weight)])))
        } else {
          setSplitMode('default')
          setSplitWeights(vacationDefaultSplit())
        }
      }
    } else {
      resetExpenseForm()
      setEditExpense(null)
    }
    setExpenseDialogOpen(true)
  }

  const splitWeightSum = Object.values(splitWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (splitMode === 'custom' && Math.abs(splitWeightSum - 1) > 0.001) {
      return
    }
    setExpenseSubmitting(true)
    try {
      const wasCustom = editExpense ? expenses?.find(e2 => e2.id === editExpense)?.isSplitCustom : false
      const data = {
        paidByUserId: expenseForm.paidByUserId,
        amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency,
        description: expenseForm.description,
        category: expenseForm.category,
        date: new Date(expenseForm.date).toISOString(),
        ...(splitMode === 'custom'
          ? { splits: vacation.participants.map(p => ({ userId: p.userId, weight: parseFloat(splitWeights[p.userId] || '0') })) }
          : wasCustom ? { resetSplit: true } : {}),
      }
      if (editExpense) {
        await updateExpenseLocal(id!, editExpense, data, vacation)
      } else {
        await createExpenseLocal(id!, data, vacation)
      }
    } finally {
      // Always close the dialog and reset — the local write already succeeded
      // even if the background sync threw, so keeping the form open would be confusing.
      setExpenseSubmitting(false)
      setExpenseDialogOpen(false)
      setEditExpense(null)
      resetExpenseForm()
    }
  }

  const handleParticipantSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setParticipantSubmitting(true)
    try {
      const splitWeight = participantWeight / 100
      if (editParticipantId) {
        await updateParticipantLocal(id!, editParticipantId, splitWeight)
      } else {
        const userInfo = allUsers?.find(u => u.id === participantUserId)
        if (userInfo) {
          await addParticipantLocal(id!, { userId: participantUserId, splitWeight }, userInfo)
        }
      }
      setParticipantDialogOpen(false)
      setEditParticipantId(null)
      setParticipantUserId('')
      setParticipantWeight(50)
    } finally {
      setParticipantSubmitting(false)
    }
  }

  const handleDeleteVacation = async () => {
    setDeleteSubmitting(true)
    try {
      await deleteVacationLocal(id!)
      navigate('/')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // Display-only view of `expenses` — search/filter/sort never touches the
  // underlying list that computeSummary() runs against.
  const visibleExpenses = expenses
    ? sortExpenses(
        filterExpenses(expenses, { search: expenseSearch, category: categoryFilter, paidByUserId: paidByFilter }),
        sortField,
        sortDir
      )
    : expenses

  const toggleSort = (field: ExpenseSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const summary = expenses ? computeSummary(vacation, expenses) : undefined

  return (
    <Layout>
      <div className="mb-6">
        <Button variant="ghost" asChild className="-ml-2 mb-2">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{vacation.name}</h1>
            {vacation.description && (
              <p className="text-muted-foreground mt-1">{vacation.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{vacation.baseCurrency}</Badge>
              <span className="text-sm text-muted-foreground">
                {format(new Date(vacation.startDate), 'MMM d, yyyy')} –{' '}
                {format(new Date(vacation.endDate), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Vacation
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses">
          <div className="flex justify-between items-center mb-4 mt-4">
            <h2 className="text-xl font-semibold">Expenses</h2>
            <Button onClick={() => handleOpenExpenseDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </div>

          {expenses?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No expenses yet. Add the first one!
            </div>
          )}

          {expenses && expenses.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search description..."
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ExpenseCategory | 'all')}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={paidByFilter} onValueChange={setPaidByFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Paid by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All payers</SelectItem>
                    {vacation.participants.map((p) => (
                      <SelectItem key={p.userId} value={p.userId}>{p.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {visibleExpenses?.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No expenses match your search/filters.
                </div>
              )}

              {visibleExpenses && visibleExpenses.length > 0 && (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {SORT_COLUMNS.map(({ field, label }) => (
                          <TableHead
                            key={field}
                            className={`cursor-pointer select-none ${field === 'amount' || field === 'amountBase' ? 'text-right' : ''}`}
                            onClick={() => toggleSort(field)}
                          >
                            <span className={`inline-flex items-center gap-1 ${field === 'amount' || field === 'amountBase' ? 'justify-end w-full' : ''}`}>
                              {label === 'In Base Currency' ? `In ${vacation.baseCurrency}` : label}
                              {sortField === field ? (
                                sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                          </TableHead>
                        ))}
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            {expense.description}
                            {expense.isSplitCustom && (
                              <Badge variant="secondary" className="ml-2 text-xs">Custom split</Badge>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="outline">{expense.category}</Badge></TableCell>
                          <TableCell>{expense.paidByUsername}</TableCell>
                          <TableCell className="text-right">{expense.amount.toFixed(2)} {expense.currency}</TableCell>
                          <TableCell className="text-right">{expense.amountInBaseCurrency.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenExpenseDialog(expense.id)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteExpenseLocal(id!, expense.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* PARTICIPANTS TAB */}
        <TabsContent value="participants">
          <div className="flex justify-between items-center mb-4 mt-4">
            <h2 className="text-xl font-semibold">Participants</h2>
            {canManage && nonParticipantUsers.length > 0 && (
              <Button onClick={() => {
                setEditParticipantId(null)
                setParticipantUserId('')
                setParticipantWeight(Math.round(100 / (vacation.participants.length + 1)))
                setParticipantDialogOpen(true)
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Participant
              </Button>
            )}
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Split Weight</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vacation.participants.map((p) => (
                  <TableRow key={p.userId}>
                    <TableCell className="font-medium">{p.username}</TableCell>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{(p.splitWeight * 100).toFixed(1)}%</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditParticipantId(p.userId)
                              setParticipantWeight(Math.round(p.splitWeight * 100))
                              setParticipantDialogOpen(true)
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {p.userId !== vacation.createdBy && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeParticipantLocal(id!, p.userId)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="text-xs text-muted-foreground mt-2">
            Note: Split weights should sum to 1.0. Current total:{' '}
            {vacation.participants.reduce((s, p) => s + p.splitWeight, 0).toFixed(4)}
          </p>
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary">
          <div className="mt-4 space-y-6">
            {pendingCount > 0 && (
              <p className="text-sm text-amber-600">
                {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync — totals already reflect them locally.
              </p>
            )}
            {summary && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Total Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">
                      {summary.totalExpenses.toFixed(2)} {summary.baseCurrency}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Individual Balances</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Fair Share</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.balances.map((b) => (
                          <TableRow key={b.userId}>
                            <TableCell className="font-medium">{b.username}</TableCell>
                            <TableCell className="text-right">{b.totalPaid.toFixed(2)} {summary.baseCurrency}</TableCell>
                            <TableCell className="text-right">{b.fairShare.toFixed(2)} {summary.baseCurrency}</TableCell>
                            <TableCell className="text-right">
                              <span className={b.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {b.balance >= 0 ? '+' : ''}{b.balance.toFixed(2)} {summary.baseCurrency}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {summary.transfers.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Settlements</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {summary.transfers.map((t, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-md border">
                            <span className="font-medium">{t.fromUsername}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{t.toUsername}</span>
                            <span className="ml-auto font-semibold text-primary">
                              {t.amount.toFixed(2)} {summary.baseCurrency}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {summary.transfers.length === 0 && summary.totalExpenses > 0 && (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      All expenses are settled!
                    </CardContent>
                  </Card>
                )}
              </>
            )}
            {!summary && (
              <div className="text-center py-12 text-muted-foreground">
                Loading...
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Paid By</Label>
              <Select value={expenseForm.paidByUserId} onValueChange={(v) => setExpenseForm((f) => ({ ...f, paidByUserId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select participant" />
                </SelectTrigger>
                <SelectContent>
                  {vacation.participants.map((p) => (
                    <SelectItem key={p.userId} value={p.userId}>{p.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={expenseForm.currency} onValueChange={(v) => setExpenseForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v as ExpenseCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Split</Label>
                {splitMode === 'default' ? (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setSplitMode('custom')}>
                    Customize for this expense
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => { setSplitMode('default'); setSplitWeights(vacationDefaultSplit()) }}
                  >
                    Reset to vacation default
                  </Button>
                )}
              </div>
              {splitMode === 'default' ? (
                <p className="text-xs text-muted-foreground">
                  Follows the vacation's split — updates automatically if it changes.
                </p>
              ) : (
                <>
                  {vacation.participants.map((p) => {
                    const pct = Math.round((parseFloat(splitWeights[p.userId] ?? '0')) * 100)
                    return (
                      <div key={p.userId} className="flex items-center gap-3">
                        <span className="text-sm w-24 shrink-0 truncate">{p.username}</span>
                        <Slider
                          value={[pct]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={([v]) =>
                            setSplitWeights((w) => redistributeSplit(w, p.userId, v / 100))
                          }
                          className="flex-1"
                        />
                        <span className="text-sm w-12 text-right tabular-nums">{pct}%</span>
                      </div>
                    )
                  })}
                  <p className="text-xs text-muted-foreground">
                    Total: {Math.round(splitWeightSum * 100)}%
                  </p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={expenseSubmitting || (splitMode === 'custom' && Math.abs(splitWeightSum - 1) > 0.001)}>
                {editExpense ? 'Save Changes' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Participant Dialog */}
      <Dialog open={participantDialogOpen} onOpenChange={setParticipantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editParticipantId ? 'Edit Split Weight' : 'Add Participant'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleParticipantSubmit} className="space-y-4">
            {!editParticipantId && (
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={participantUserId} onValueChange={setParticipantUserId}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {nonParticipantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.username} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Split Weight</Label>
                <span className="text-sm font-medium tabular-nums">{participantWeight}%</span>
              </div>
              <Slider
                value={[participantWeight]}
                min={1}
                max={100}
                step={1}
                onValueChange={([v]) => setParticipantWeight(v)}
              />
              {(() => {
                const otherSum = vacation.participants
                  .filter(p => p.userId !== editParticipantId)
                  .reduce((s, p) => s + p.splitWeight, 0)
                const total = Math.round((otherSum + participantWeight / 100) * 100)
                return (
                  <p className={`text-xs ${total === 100 ? 'text-muted-foreground' : 'text-amber-500'}`}>
                    Total across all participants: {total}%{total !== 100 ? ' — adjust other weights to reach 100%' : ''}
                  </p>
                )
              })()}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setParticipantDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={participantSubmitting}>
                {editParticipantId ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Vacation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vacation</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete "{vacation.name}"? All expenses will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteSubmitting} onClick={handleDeleteVacation}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
