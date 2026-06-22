import { getSnapshot } from '@/lib/snapshots'
import { titleFor } from '@/lib/menu'
import { Placeholder } from '@/components/ui/Placeholder'

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const pathname = '/' + (slug?.join('/') ?? '')
  const html = getSnapshot(pathname)
  if (html) return <div className="view active" dangerouslySetInnerHTML={{ __html: html }} />
  return <Placeholder title={titleFor(pathname).title} />
}
