import { prisma } from "../../config/prisma.js";
import {
  MARKET_HOME_SETTING_KEY,
  resolveMarketHome,
  type MarketHomeSection,
  type MarketHomeSectionsInput,
} from "./marketHome.schema.js";

/**
 * The marketplace homepage's section list, stored as one `PlatformSetting`
 * row. No row yet = the platform default, so `/` renders exactly as it did
 * before this setting existed.
 */

export async function getSections(): Promise<MarketHomeSection[]> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: MARKET_HOME_SETTING_KEY },
  });
  return resolveMarketHome(row?.value);
}

/** Replace the whole list; answers with the normalised list as stored. */
export async function saveSections(
  input: MarketHomeSectionsInput,
): Promise<MarketHomeSection[]> {
  const sections = resolveMarketHome(input);
  const value = { sections: sections.map(({ key, enabled }) => ({ key, enabled })) };
  await prisma.platformSetting.upsert({
    where: { key: MARKET_HOME_SETTING_KEY },
    create: { key: MARKET_HOME_SETTING_KEY, value },
    update: { value },
  });
  return sections;
}
