const LABELS: Record<string, string> = {
  'store.created': 'Utworzono sklep',
  'store.updated': 'Zmieniono ustawienia sklepu',
  'store.settings.updated': 'Zmieniono dane firmy',
  'team.invitation.created': 'Wysłano zaproszenie do zespołu',
  'team.invitation.revoked': 'Anulowano zaproszenie',
  'team.invitation.accepted': 'Przyjęto zaproszenie do zespołu',
  'team.member.updated': 'Zmieniono rolę członka zespołu',
  'team.member.removed': 'Usunięto osobę z zespołu',
  'admin.tenant.suspended': 'Sklep zawieszony przez administratora platformy',
  'admin.tenant.reactivated': 'Sklep przywrócony przez administratora platformy',
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}
