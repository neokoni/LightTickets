const TICKET_REF_RE = /#(\d+)/g

export function renderTicketRefs(text: string): string {
  return text.replace(TICKET_REF_RE, '[$&](/tickets/$1)')
}
