import { ISpace } from "@/features/space/types/space.types";

export function excludePersonalSpaces(spaces: ISpace[]): ISpace[] {
  return spaces.filter((space) => !space.isPersonal);
}
