type MatchCompLevel = 'qm' | 'qf' | 'sf' | 'f' | 'other';

interface ParsedMatchLabel {
    compLevel: MatchCompLevel;
    setNumber: number;
    matchNumber: number;
    normalizedLabel: string;
}

const COMP_LEVEL_ORDER: Record<MatchCompLevel, number> = {
    qm: 1,
    qf: 2,
    sf: 3,
    f: 4,
    other: 5,
};

function cleanLabel(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function parseCompactMatchNotation(label: string): ParsedMatchLabel | null {
    const normalized = label.toLowerCase();

    const qm = normalized.match(/^qm(\d+)$/i);
    if (qm && qm[1]) {
        const matchNumber = Number.parseInt(qm[1], 10) || 0;
        return {
            compLevel: 'qm',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Qual ${matchNumber}`,
        };
    }

    const qf = normalized.match(/^qf(\d+)m(\d+)$/i);
    if (qf && qf[1] && qf[2]) {
        const setNumber = Number.parseInt(qf[1], 10) || 1;
        const matchNumber = Number.parseInt(qf[2], 10) || 0;
        return {
            compLevel: 'qf',
            setNumber,
            matchNumber,
            normalizedLabel: `Quarterfinal ${setNumber}-${matchNumber}`,
        };
    }

    const sf = normalized.match(/^sf(\d+)m(\d+)$/i);
    if (sf && sf[1] && sf[2]) {
        const setNumber = Number.parseInt(sf[1], 10) || 1;
        const matchNumber = Number.parseInt(sf[2], 10) || 0;
        return {
            compLevel: 'sf',
            setNumber,
            matchNumber,
            normalizedLabel: `Semifinal ${setNumber}`,
        };
    }

    const f = normalized.match(/^f(\d+)m(\d+)$/i);
    if (f && f[1] && f[2]) {
        const matchNumber = Number.parseInt(f[2], 10) || 0;
        return {
            compLevel: 'f',
            setNumber: Number.parseInt(f[1], 10) || 1,
            matchNumber,
            normalizedLabel: `Final ${matchNumber}`,
        };
    }

    return null;
}

function parseNaturalLanguageMatchLabel(label: string): ParsedMatchLabel | null {
    const normalized = label.toLowerCase();

    const qual = normalized.match(/^(?:qual|qualification|q)\s*(\d+)$/i);
    if (qual && qual[1]) {
        const matchNumber = Number.parseInt(qual[1], 10) || 0;
        return {
            compLevel: 'qm',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Qual ${matchNumber}`,
        };
    }

    const qfSetAndMatch = normalized.match(/^(?:quarter\s*final|quarterfinal|qf)\s*(\d+)\s*[-m]\s*(\d+)$/i);
    if (qfSetAndMatch && qfSetAndMatch[1] && qfSetAndMatch[2]) {
        const setNumber = Number.parseInt(qfSetAndMatch[1], 10) || 1;
        const matchNumber = Number.parseInt(qfSetAndMatch[2], 10) || 0;
        return {
            compLevel: 'qf',
            setNumber,
            matchNumber,
            normalizedLabel: `Quarterfinal ${setNumber}-${matchNumber}`,
        };
    }

    const sfSetAndMatch = normalized.match(/^(?:semi\s*final|semifinal|sf)\s*(\d+)\s*[-m]\s*(\d+)$/i);
    if (sfSetAndMatch && sfSetAndMatch[1] && sfSetAndMatch[2]) {
        const setNumber = Number.parseInt(sfSetAndMatch[1], 10) || 1;
        const matchNumber = Number.parseInt(sfSetAndMatch[2], 10) || 0;
        return {
            compLevel: 'sf',
            setNumber,
            matchNumber,
            normalizedLabel: `Semifinal ${setNumber}`,
        };
    }

    const finalSetAndMatch = normalized.match(/^(?:final|finals|f)\s*(\d+)\s*[-m]\s*(\d+)$/i);
    if (finalSetAndMatch && finalSetAndMatch[1] && finalSetAndMatch[2]) {
        const matchNumber = Number.parseInt(finalSetAndMatch[2], 10) || 0;
        return {
            compLevel: 'f',
            setNumber: Number.parseInt(finalSetAndMatch[1], 10) || 1,
            matchNumber,
            normalizedLabel: `Final ${matchNumber}`,
        };
    }

    const qfSingle = normalized.match(/^(?:quarter\s*final|quarterfinal|qf)\s*(\d+)$/i);
    if (qfSingle && qfSingle[1]) {
        const matchNumber = Number.parseInt(qfSingle[1], 10) || 0;
        return {
            compLevel: 'qf',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Quarterfinal ${matchNumber}`,
        };
    }

    const sfSingle = normalized.match(/^(?:semi\s*final|semifinal|sf)\s*(\d+)$/i);
    if (sfSingle && sfSingle[1]) {
        const matchNumber = Number.parseInt(sfSingle[1], 10) || 0;
        return {
            compLevel: 'sf',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Semifinal ${matchNumber}`,
        };
    }

    const finalSingle = normalized.match(/^(?:final|finals|f)\s*(\d+)$/i);
    if (finalSingle && finalSingle[1]) {
        const matchNumber = Number.parseInt(finalSingle[1], 10) || 0;
        return {
            compLevel: 'f',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Final ${matchNumber}`,
        };
    }

    return null;
}

function parseMatchLabel(value: unknown): ParsedMatchLabel {
    const cleaned = cleanLabel(value);
    if (cleaned === '') {
        return {
            compLevel: 'other',
            setNumber: 1,
            matchNumber: 0,
            normalizedLabel: 'Unknown Match',
        };
    }

    const compact = parseCompactMatchNotation(cleaned);
    if (compact) {
        return compact;
    }

    const naturalLanguage = parseNaturalLanguageMatchLabel(cleaned);
    if (naturalLanguage) {
        return naturalLanguage;
    }

    if (/^\d+$/.test(cleaned)) {
        const matchNumber = Number.parseInt(cleaned, 10) || 0;
        return {
            compLevel: 'qm',
            setNumber: 1,
            matchNumber,
            normalizedLabel: `Qual ${matchNumber}`,
        };
    }

    const firstNumber = cleaned.match(/\d+/);
    return {
        compLevel: 'other',
        setNumber: 1,
        matchNumber: firstNumber ? Number.parseInt(firstNumber[0], 10) || 0 : 0,
        normalizedLabel: cleaned,
    };
}

export function getDisplayMatchLabel(value: unknown): string {
    const cleaned = cleanLabel(value);
    if (cleaned === '') {
        return 'Unknown Match';
    }

    if (/^\d+$/.test(cleaned)) {
        return parseMatchLabel(cleaned).normalizedLabel;
    }

    const compact = parseCompactMatchNotation(cleaned);
    if (compact) {
        return compact.normalizedLabel;
    }

    return cleaned;
}

export function compareMatchLabels(a: unknown, b: unknown): number {
    const parsedA = parseMatchLabel(a);
    const parsedB = parseMatchLabel(b);

    const compOrderDiff = COMP_LEVEL_ORDER[parsedA.compLevel] - COMP_LEVEL_ORDER[parsedB.compLevel];
    if (compOrderDiff !== 0) {
        return compOrderDiff;
    }

    if (parsedA.setNumber !== parsedB.setNumber) {
        return parsedA.setNumber - parsedB.setNumber;
    }

    if (parsedA.matchNumber !== parsedB.matchNumber) {
        return parsedA.matchNumber - parsedB.matchNumber;
    }

    const labelA = getDisplayMatchLabel(a);
    const labelB = getDisplayMatchLabel(b);
    return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
}
