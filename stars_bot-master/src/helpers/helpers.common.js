class HelpersCommon {
    formatNumber(number, separator = ' ') {
        return new Intl.NumberFormat('en-US', {
            useGrouping: true,
            groupingSeparator: ' ',
        })
            .format(number)
            .replace(/,/g, separator);
    }

    calculatePercentage(number, percentage) {
        return Math.floor((number * percentage) / 100);
    }
}

module.exports = new HelpersCommon();