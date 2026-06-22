import { getSnapshot } from '@/lib/snapshots'
import { Placeholder } from '@/components/ui/Placeholder'

export default function HomePage() {
  const html = getSnapshot('/')
  if (!html) return <Placeholder title="Dashboard" />
  return <div className="view active" dangerouslySetInnerHTML={{ __html: html }} />
}
