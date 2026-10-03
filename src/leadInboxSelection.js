export function findLeadById(activeLeads, archivedLeads, id) {
  return activeLeads.find(lead => lead.id === id)
    || archivedLeads.find(lead => lead.id === id)
    || null
}
