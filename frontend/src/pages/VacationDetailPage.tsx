import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getVacation, getExpenses, getSummary,
  createExpense, updateExpense, deleteExpense,
  addParticipant, updateParticipant, removeParticipant,
} from '@/api/vacations'
import { getUsers } from '@/api/users'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Trash2, Edit2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import type { ExpenseCategory } from '@/types'

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Accommodation', 'Food', 'Transport', 'Activities', 'Shopping', 'Healthcare', 'Other',
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK']

export function VacationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const { data: vacation, isLoading } = useQuery({
    queryKey: ['vacation', id],
    queryFn: () => getVacation(id!),
  })

  const { data: expenses } = useQuery({
    queryKey: ['expenses', id],
    queryFn: () => getExpenses(id!),
    enabled: !!vacation,
  })

  const { data: summary } = useQuery({
    queryKey: ['summary', id],
    queryFn: () => getSummary(id!),
    enabled: !!vacation,
  })

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

  // Participant dialog
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false)
  const [participantUserId, setParticipantUserId] = useState('')
  const [participantWeight, setParticipantWeight] = useState('')
  const [editParticipantId, setEditParticipantId] = useState<string | null>(null)

  const isCreator = vacation?.createdBy === user?.id

  const createExpenseMutation = useMutation({
    mutationFn: (data: Parameters<typeof createExpense>[1]) => createExpense(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
      setExpenseDialogOpen(false)
      resetExpenseForm()
    },
  })

  const updateExpenseMutation = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: string; data: Parameters<typeof updateExpense>[2] }) =>
      updateExpense(id!, expenseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
      setExpenseDialogOpen(false)
      setEditExpense(null)
      resetExpenseForm()
    },
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) => deleteExpense(id!, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
    },
  })

  const addParticipantMutation = useMutation({
    mutationFn: (data: { userId: string; splitWeight: number }) => addParticipant(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
      setParticipantDialogOpen(false)
      setParticipantUserId('')
      setParticipantWeight('')
    },
  })

  const updateParticipantMutation = useMutation({
    mutationFn: ({ userId, splitWeight }: { userId: string; splitWeight: number }) =>
      updateParticipant(id!, userId, { splitWeight }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
      setParticipantDialogOpen(false)
      setEditParticipantId(null)
      setParticipantWeight('')
    },
  })

  const removeParticipantMutation = useMutation({
    mutationFn: (userId: string) => removeParticipant(id!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
    },
  })

  const resetExpenseForm = () => {
    setExpenseForm({
      paidByUserId: vacation?.participants[0]?.userId ?? '',
      amount: '',
      currency: vacation?.baseCurrency ?? 'EUR',
      description: '',
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
    })
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
      }
    } else {
      resetExpenseForm()
      setEditExpense(null)
    }
    setExpenseDialogOpen(true)
  }

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      paidByUserId: expenseForm.paidByUserId,
      amount: parseFloat(expenseForm.amount),
      currency: expenseForm.currency,
      description: expenseForm.description,
      category: expenseForm.category,
      date: new Date(expenseForm.date).toISOString(),
    }
    if (editExpense) {
      updateExpenseMutation.mutate({ expenseId: editExpense, data })
    } else {
      createExpenseMutation.mutate(data)
    }
  }

  const handleParticipantSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const splitWeight = parseFloat(participantWeight)
    if (editParticipantId) {
      updateParticipantMutation.mutate({ userId: editParticipantId, splitWeight })
    } else {
      addParticipantMutation.mutate({ userId: participantUserId, splitWeight })
    }
  }

  if (isLoading) {
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

  const canManage = isAdmin || isCreator
  const nonParticipantUsers = allUsers?.filter(
    (u) => !vacation.participants.some((p) => p.userId === u.id)
  ) ?? []

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

          {expenses && expenses.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No expenses yet. Add the first one!
            </div>
          )}

          {expenses && expenses.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">In {vacation.baseCurrency}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{expense.description}</TableCell>
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
                            onClick={() => deleteExpenseMutation.mutate(expense.id)}
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
        </TabsContent>

        {/* PARTICIPANTS TAB */}
        <TabsContent value="participants">
          <div className="flex justify-between items-center mb-4 mt-4">
            <h2 className="text-xl font-semibold">Participants</h2>
            {canManage && nonParticipantUsers.length > 0 && (
              <Button onClick={() => {
                setEditParticipantId(null)
                setParticipantUserId('')
                setParticipantWeight('')
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
                              setParticipantWeight(String(p.splitWeight))
                              setParticipantDialogOpen(true)
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {p.userId !== vacation.createdBy && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeParticipantMutation.mutate(p.userId)}
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
                          <div
                            key={i}
                            className="flex items-center gap-3 p-3 rounded-md border"
                          >
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}>
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
            <div className="space-y-2">
              <Label>Split Weight (0.0 – 1.0)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="1"
                value={participantWeight}
                onChange={(e) => setParticipantWeight(e.target.value)}
                placeholder="0.5"
                required
              />
              <p className="text-xs text-muted-foreground">All participants' weights should sum to 1.0</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setParticipantDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addParticipantMutation.isPending || updateParticipantMutation.isPending}>
                {editParticipantId ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
