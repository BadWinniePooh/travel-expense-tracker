import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, Users, Plane } from 'lucide-react'
import { format } from 'date-fns'

export function DashboardPage() {
  const vacations = useLiveQuery(() => db.vacations.toArray())

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Vacations</h1>
          <p className="text-muted-foreground mt-1">Track expenses for all your trips</p>
        </div>
        <Button asChild>
          <Link to="/vacations/new">
            <Plus className="h-4 w-4 mr-2" />
            New Vacation
          </Link>
        </Button>
      </div>

      {vacations === undefined && (
        <div className="text-center py-12 text-muted-foreground">Loading vacations...</div>
      )}

      {vacations?.length === 0 && (
        <div className="text-center py-16">
          <Plane className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No vacations yet</h3>
          <p className="text-muted-foreground mb-4">Create your first vacation to start tracking expenses.</p>
          <Button asChild>
            <Link to="/vacations/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Vacation
            </Link>
          </Button>
        </div>
      )}

      {vacations && vacations.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vacations.map((vacation) => (
            <Link key={vacation.id} to={`/vacations/${vacation.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{vacation.name}</CardTitle>
                    <Badge variant="secondary">{vacation.baseCurrency}</Badge>
                  </div>
                  {vacation.description && (
                    <CardDescription className="line-clamp-2">{vacation.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(vacation.startDate), 'MMM d, yyyy')} –{' '}
                        {format(new Date(vacation.endDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{vacation.participants.length} participant{vacation.participants.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
