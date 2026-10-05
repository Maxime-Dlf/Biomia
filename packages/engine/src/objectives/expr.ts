/**
 * Mini-langage d'expressions numériques des valeurs `N` des objectifs (§10.3, §10.4) :
 * nombres, variables, `+ - * /`, parenthèses, `min(…)`, `max(…)`. Aucun `eval`.
 */
export type ExprVariables = Readonly<Record<string, number>>;

export function evaluateExpression(source: string, vars: ExprVariables): number {
  const tokens = source.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[-+*/(),]/g) ?? [];
  if (tokens.join('') !== source.replace(/\s+/g, ''))
    throw new Error(`Expression invalide : ${source}`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (t: string) => {
    if (next() !== t) throw new Error(`Expression invalide : ${source} (« ${t} » attendu)`);
  };

  function primary(): number {
    const t = next();
    if (t === undefined) throw new Error(`Expression incomplète : ${source}`);
    if (t === '(') {
      const v = additive();
      expect(')');
      return v;
    }
    if (t === '-') return -primary();
    if (/^\d/.test(t)) return Number(t);
    if (t === 'min' || t === 'max') {
      expect('(');
      const args = [additive()];
      while (peek() === ',') {
        next();
        args.push(additive());
      }
      expect(')');
      return t === 'min' ? Math.min(...args) : Math.max(...args);
    }
    const v = vars[t];
    if (v === undefined) throw new Error(`Variable inconnue « ${t} » dans ${source}`);
    return v;
  }

  function multiplicative(): number {
    let v = primary();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = primary();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }

  function additive(): number {
    let v = multiplicative();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = multiplicative();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const value = additive();
  if (i !== tokens.length) throw new Error(`Expression invalide : ${source}`);
  return value;
}

/** Arrondi à l'entier le plus proche, demi vers le haut (« arrondi » du §10.4). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}
