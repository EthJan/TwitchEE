export function getBrowserLanguage(): string | undefined {
    const languages = navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    return languages
        .map((language) => language.split("-")[0]?.toLowerCase())
        .find((language) => Boolean(language && /^[a-z]{2}$/.test(language)));
}
