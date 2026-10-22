export function profilePayload(draft, currentName, owner) {
  const result = {
    expectedUserId: owner,
    bio: draft.bio,
    location: draft.location,
    website: draft.website,
    publicEnabled: draft.publicEnabled,
    showActivity: draft.publicEnabled ? draft.showActivity : false
  };
  if (typeof draft.name === 'string' && draft.name.trim() !== currentName) {
    result.name = draft.name.trim();
  }
  return result;
}
