import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AchievementsPanel } from "./AchievementsPanel";
import { ACHIEVEMENT_COUNT } from "../progression/achievements";
import { createEmptyAchievementRecord, type AchievementRecord } from "../utils/storage";

const recordWith = (unlocked: AchievementRecord["unlocked"]): AchievementRecord => ({
  ...createEmptyAchievementRecord(),
  unlocked,
});

const secretItem = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-achievement-id="curious-mind"]')!;

describe("AchievementsPanel", () => {
  it("lists a locked secret as ??? without its title or description", () => {
    const { container } = render(
      <AchievementsPanel record={recordWith({})} onClose={vi.fn()} />,
    );
    const item = secretItem(container);
    expect(item.className).toContain("locked");
    expect(within(item).getByText("???")).toBeTruthy();
    expect(container.textContent).not.toContain("Curious Mind");
    expect(screen.getByText(`0 / ${ACHIEVEMENT_COUNT} UNLOCKED`)).toBeTruthy();
  });

  it("reveals the secret once unlocked and counts it", () => {
    const { container } = render(
      <AchievementsPanel record={recordWith({ "curious-mind": 1 })} onClose={vi.fn()} />,
    );
    const item = secretItem(container);
    expect(item.className).toContain("unlocked");
    expect(within(item).getByText("Curious Mind")).toBeTruthy();
    expect(within(item).queryByText("???")).toBeNull();
    expect(screen.getByText(`1 / ${ACHIEVEMENT_COUNT} UNLOCKED`)).toBeTruthy();
  });
});
