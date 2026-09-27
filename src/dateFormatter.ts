/** One formatter per locale/options pair, rather than one per displayed date. */
export function reusableDateFormatter(
  options: Intl.DateTimeFormatOptions,
  locale: () => string,
) {
  let currentLocale = "";
  let formatter: Intl.DateTimeFormat;
  return {
    format(value: Date | number) {
      const nextLocale = locale();
      if (!formatter || nextLocale !== currentLocale) {
        formatter = new Intl.DateTimeFormat(nextLocale, {
          timeZone: "Asia/Tokyo",
          ...options,
        });
        currentLocale = nextLocale;
      }
      return formatter.format(value);
    },
  };
}
