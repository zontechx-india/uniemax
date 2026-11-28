import type { ReactNode } from 'react'

/**
 * Draws a policy's wording — a small, safe subset of Markdown, built as React
 * elements (never HTML strings), so wording typed by an admin can't inject
 * markup:
 *   - a line that is only **bold text** (or starts with #) → a sub-heading
 *   - lines starting with "- " or "* " → a bullet list
 *   - other lines → paragraphs (consecutive lines join; a blank line splits)
 *   - **bold** inside any line
 * Pass the already-filled wording (`renderedBody` / `renderPolicyBody`).
 */

type Block = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

function parse(body: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    if (list.length) blocks.push({ kind: 'ul', items: list })
    para = []
    list = []
  }
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      if (para.length) flush()
      list.push(bullet[1] ?? '')
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line) ?? /^\*\*([^*]+)\*\*$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'h', text: heading[1] ?? '' })
      continue
    }
    if (list.length) flush()
    para.push(line)
  }
  flush()
  return blocks
}

/** **bold** spans inside one line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

export function PolicyText({ body, className = '' }: { body: string; className?: string }) {
  const blocks = parse(body)
  if (blocks.length === 0) return <p className={`text-muted ${className}`}>No wording yet.</p>
  return (
    <div className={`space-y-2 leading-relaxed text-fg ${className}`}>
      {blocks.map((block, i) =>
        block.kind === 'h' ? (
          <h3 key={i} className="pt-2 font-semibold text-fg first:pt-0">
            {inline(block.text)}
          </h3>
        ) : block.kind === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted">
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  )
}
