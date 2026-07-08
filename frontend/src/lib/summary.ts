import type { Expense, Summary, Vacation } from '@/types'

// Mirrors VacationsController.GetSummary on the backend so totals and fair
// shares can be recalculated locally from IndexedDB, instead of only ever
// reflecting the last successful server sync.
export function computeSummary(vacation: Vacation, expenses: Expense[]): Summary {
  const totalExpenses = round2(expenses.reduce((s, e) => s + e.amountInBaseCurrency, 0))

  const participants = vacation.participants
  const fairShares = Object.fromEntries(participants.map(p => [p.userId, 0])) as Record<string, number>

  for (const e of expenses) {
    if (e.splits.length > 0) {
      for (const s of e.splits) {
        if (s.userId in fairShares) fairShares[s.userId] += e.amountInBaseCurrency * s.weight
      }
    } else {
      for (const p of participants) fairShares[p.userId] += e.amountInBaseCurrency * p.splitWeight
    }
  }

  const balances = participants.map(p => {
    const paid = expenses
      .filter(e => e.paidByUserId === p.userId)
      .reduce((s, e) => s + e.amountInBaseCurrency, 0)
    const fairShare = fairShares[p.userId]
    return {
      userId: p.userId,
      username: p.username,
      totalPaid: round2(paid),
      fairShare: round2(fairShare),
      balance: round2(paid - fairShare),
    }
  })

  const debtors = balances
    .filter(b => b.balance < 0)
    .map(b => ({ userId: b.userId, username: b.username, amount: -b.balance }))
    .sort((a, b) => b.amount - a.amount)
  const creditors = balances
    .filter(b => b.balance > 0)
    .map(b => ({ userId: b.userId, username: b.username, amount: b.balance }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: Summary['transfers'] = []
  let di = 0
  let ci = 0
  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].amount, creditors[ci].amount)
    if (amount > 0.005) {
      transfers.push({
        fromUserId: debtors[di].userId,
        fromUsername: debtors[di].username,
        toUserId: creditors[ci].userId,
        toUsername: creditors[ci].username,
        amount: round2(amount),
      })
    }
    debtors[di].amount -= amount
    creditors[ci].amount -= amount
    if (debtors[di].amount < 0.005) di++
    if (creditors[ci].amount < 0.005) ci++
  }

  return { totalExpenses, baseCurrency: vacation.baseCurrency, balances, transfers }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
