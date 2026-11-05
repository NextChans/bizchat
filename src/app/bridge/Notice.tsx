export default function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="shell plain center">
      <h1 className="h1">{title}</h1>
      <p className="muted">{body}</p>
      {children}
    </main>
  )
}
