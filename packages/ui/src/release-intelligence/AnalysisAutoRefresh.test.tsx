// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisAutoRefresh } from "./AnalysisAutoRefresh";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("AnalysisAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("backs off and stops polling after ten minutes", () => {
    render(<AnalysisAutoRefresh active />);

    act(() => vi.advanceTimersByTime(3_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(6_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(10 * 60 * 1_000));
    const callsAtCap = refresh.mock.calls.length;
    act(() => vi.advanceTimersByTime(60 * 60 * 1_000));

    expect(callsAtCap).toBeGreaterThan(2);
    expect(refresh).toHaveBeenCalledTimes(callsAtCap);
  });

  it("does not poll when the attempt is terminal", () => {
    render(<AnalysisAutoRefresh active={false} />);
    act(() => vi.advanceTimersByTime(60 * 60 * 1_000));
    expect(refresh).not.toHaveBeenCalled();
  });
});
