/**
 * Sends a POST from a form built for the call, the way a link sends a GET: the
 * browser follows the redirect of the answer, in `target`. The routes that open
 * or close a session answer POST only, which a link on another site cannot send.
 */
export function postForm(action: string, fields: Record<string, string> = {}, target?: string): void {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = action
  if (target)
    form.target = target
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  form.submit()
  form.remove()
}
