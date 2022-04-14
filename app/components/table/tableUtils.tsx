import { format, parseISO } from "date-fns";

export const formatDate = (date: string) =>
  format(parseISO(date), "K:mmb MM/dd/yyyy");
