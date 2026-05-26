import { formatDate } from "./tableUtils";

test("Formats dates as expected output", () => {
  const date = new Date(2022, 0, 1).toISOString();
  expect(formatDate(date)).toBe("12:00 AM 01/01/2022");
});
