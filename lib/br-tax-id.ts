export function normalizeTaxId(value: unknown) {
	return String(value || "").replace(/\D/g, "").slice(0, 14);
}

export function isValidTaxId(value: unknown) {
	const digits = normalizeTaxId(value);
	if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
	const calculate = (base: string, weights: number[]) => {
		const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
		const remainder = total % 11;
		return remainder < 2 ? 0 : 11 - remainder;
	};
	if (digits.length === 11) {
		const first = calculate(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
		const second = calculate(digits.slice(0, 9) + first, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
		return digits.endsWith(`${first}${second}`);
	}
	const first = calculate(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
	const second = calculate(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
	return digits.endsWith(`${first}${second}`);
}

export function formatTaxId(value: string) {
	const digits = normalizeTaxId(value);
	if (digits.length <= 11)
		return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
	return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
