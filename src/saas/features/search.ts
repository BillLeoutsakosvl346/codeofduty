export function nextDiscoveryIndex(currentIndex: number, totalProfiles: number) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(totalProfiles) || totalProfiles < 1) {
    throw new Error("Discovery index requires a non-empty profile collection");
  }
  return (currentIndex + 1) % totalProfiles;
}
