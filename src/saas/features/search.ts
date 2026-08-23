export function nextDiscoveryIndex(currentIndex: number, totalProfiles: number) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(totalProfiles) || totalProfiles < 1) {
    throw new Error("Discovery index requires a non-empty profile collection");
  }
  return (currentIndex + 1) % totalProfiles;
}

type DiscoverableHorse = {
  disciplines: readonly string[];
  temperament: string;
};

type DiscoveryFilters = {
  disciplines?: readonly string[];
  temperament?: string | null;
};

export function filterDiscoveryProfiles<T extends DiscoverableHorse>(profiles: readonly T[], filters: DiscoveryFilters): T[] {
  const disciplines = filters.disciplines ?? [];
  const temperament = filters.temperament?.trim().toLocaleLowerCase() ?? "";

  return profiles.filter((profile) => {
    const matchesDiscipline = disciplines.length === 0 || disciplines.some((discipline) => profile.disciplines.includes(discipline));
    const matchesTemperament = temperament.length === 0 || profile.temperament.toLocaleLowerCase().includes(temperament);
    return matchesDiscipline && matchesTemperament;
  });
}
