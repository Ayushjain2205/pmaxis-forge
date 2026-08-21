import { MarkdownBody } from './MarkdownBody'
import { groupTurns, toolLabel, type ChatItem } from '../lib/chat'

function ToolCall({
  name,
  args,
  result,
  ok,
}: {
  name: string
  args: string
  result?: string
  ok?: boolean
}) {
  const pending = result === undefined
  const status = pending ? 'running' : ok === false ? 'failed' : 'done'
  return (
    <details className={`tool tool-${status}`} open={pending || ok === false}>
      <summary>
        <span className="tool-name">{toolLabel(name)}</span>
        <span className="tool-status">
          {pending ? 'running' : ok === false ? 'failed' : 'done'}
        </span>
      </summary>
      <pre className="body">{args}</pre>
      {result ? <pre className="body muted">{result.slice(0, 4000)}</pre> : null}
    </details>
  )
}

export function ChatLog({
  items,
  running,
  error,
}: {
  items: ChatItem[]
  running: boolean
  error: string | null
}) {
  const turns = groupTurns(items)
  const last = items[items.length - 1]
  const showPulse =
    running &&
    (!last || last.kind === 'user' || last.kind === 'tool' || (last.kind === 'assistant' && !last.text))
  const pulseInLastForge = showPulse && last !== undefined && last.kind !== 'user'

  if (items.length === 0 && !running && !error) {
    return (
      <div className="chat-empty">
        <p className="chat-empty-title">Start a thread</p>
        <p>Ask about a live market, or pick one on the right and hit Ask about this.</p>
      </div>
    )
  }

  return (
    <>
      {turns.map((turn) => {
        if (turn.kind === 'user') {
          return (
            <article key={turn.id} className="turn turn-user" aria-label="You">
              <div className="who">You</div>
              <div className="bubble-user">
                <div className="body">{turn.item.text}</div>
              </div>
            </article>
          )
        }
        const pulseHere = pulseInLastForge && turn.id === turns[turns.length - 1]?.id
        return (
          <article key={turn.id} className="turn turn-forge" aria-label="Forge">
            <div className="who">Forge</div>
            {turn.items.map((item) =>
              item.kind === 'tool' ? (
                <ToolCall
                  key={item.id}
                  name={item.name}
                  args={item.args}
                  result={item.result}
                  ok={item.ok}
                />
              ) : (
                <MarkdownBody key={item.id} text={item.text} />
              ),
            )}
            {pulseHere ? (
              <p className="working" aria-live="polite">
                Working…
              </p>
            ) : null}
          </article>
        )
      })}
      {showPulse && !pulseInLastForge ? (
        <article className="turn turn-forge" aria-label="Forge" aria-live="polite">
          <div className="who">Forge</div>
          <p className="working">Working…</p>
        </article>
      ) : null}
      {error ? (
        <p className="err chat-err" role="alert">
          {error} Retry send, or open Keys if the model credential is missing.
        </p>
      ) : null}
    </>
  )
}
