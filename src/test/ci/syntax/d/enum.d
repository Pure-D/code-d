/**
 * Selector constants for ucurr_getName().
 */
enum UCurrNameStyle {
    /**
     * Selector for ucurr_getName indicating a symbolic name for a
     * currency, such as "$" for USD.
     * @stable ICU 2.6
     */
    UCURR_SYMBOL_NAME,

    /**
     * Selector for ucurr_getName indicating the long name for a
     * currency, such as "US Dollar" for USD.
     * @stable ICU 2.6
     */
    UCURR_LONG_NAME,

    /**
     * Selector for getName() indicating the narrow currency symbol.
     * The narrow currency symbol is similar to the regular currency
     * symbol, but it always takes the shortest form: for example,
     * "$" instead of "US$" for USD in en-CA.
     *
     * @stable ICU 61
     */
    UCURR_NARROW_SYMBOL_NAME,
}
