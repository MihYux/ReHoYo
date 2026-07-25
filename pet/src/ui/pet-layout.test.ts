import { describe, expect, it } from "vitest";
import {
  calculatePetStageTop,
  PET_SPEECH_CLEARANCE,
} from "./pet-layout";

describe("calculatePetStageTop", () => {
  it("places the character below the complete speech area", () => {
    const speechAreaTop = 46;
    const speechAreaHeight = 238;

    expect(calculatePetStageTop(speechAreaTop, speechAreaHeight)).toBe(
      speechAreaTop + speechAreaHeight + PET_SPEECH_CLEARANCE,
    );
  });

  it("rounds fractional measurements away from the speech bubble", () => {
    expect(calculatePetStageTop(46.2, 107.1, 20)).toBe(174);
  });
});
