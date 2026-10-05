import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { createRepayment } from '@/api/balances'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface Person {
  id: string
  username: string
}

export interface RepaymentPrefill {
  // The other person involved, from the current user's point of view
  counterpartId?: string
  direction?: 'paid' | 'received'
  amount?: number
}

interface Props {
  open: boolean
  onClose: () => void
  currency: string
  currentUserId: string
  isAdmin: boolean
  people: Person[]
  prefill?: RepaymentPrefill
}

const today = () => format(new Date(), 'yyyy-MM-dd')

export function AddRepaymentDialog({ open, onClose, currency, currentUserId, isAdmin, people, prefill }: Props) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<'paid' | 'received'>('paid')
  const [counterpartId, setCounterpartId] = useState('')
  const [fromId, setFromId] = useState('') // admin mode only
  const [toId, setToId] = useState('')     // admin mode only
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDirection(prefill?.direction ?? 'paid')
    setCounterpartId(prefill?.counterpartId ?? '')
    setFromId('')
    setToId('')
    setAmount(prefill?.amount !== undefined ? prefill.amount.toFixed(2) : '')
    setNote('')
    setDate(today())
    setError('')
  }, [open, prefill])

  const mutation = useMutation({
    mutationFn: createRepayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to record repayment.')
    },
  })

  const others = people.filter((p) => p.id !== currentUserId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    let fromUserId: string
    let toUserId: string
    if (isAdmin) {
      fromUserId = fromId
      toUserId = toId
    } else {
      fromUserId = direction === 'paid' ? currentUserId : counterpartId
      toUserId = direction === 'paid' ? counterpartId : currentUserId
    }
    if (!fromUserId || !toUserId) {
      setError('Choose who paid whom.')
      return
    }
    if (fromUserId === toUserId) {
      setError('Payer and receiver must be different people.')
      return
    }

    mutation.mutate({
      fromUserId,
      toUserId,
      amount: value,
      note: note.trim() || undefined,
      date: date ? new Date(`${date}T12:00:00Z`).toISOString() : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add repayment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isAdmin ? (
            <>
              <div className="space-y-2">
                <Label>Paid by</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Paid to</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
                <Button
                  type="button"
                  variant={direction === 'paid' ? 'default' : 'outline'}
                  onClick={() => setDirection('paid')}
                >
                  I paid
                </Button>
                <Button
                  type="button"
                  variant={direction === 'received' ? 'default' : 'outline'}
                  onClick={() => setDirection('received')}
                >
                  I received
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{direction === 'paid' ? 'Paid to' : 'Received from'}</Label>
                <Select value={counterpartId} onValueChange={setCounterpartId}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {others.map((p) => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="repayAmount">Amount ({currency})</Label>
            <Input
              id="repayAmount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repayDate">Date</Label>
            <Input id="repayDate" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repayNote">Note (optional)</Label>
            <Input id="repayNote" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Add repayment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
