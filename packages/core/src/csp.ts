import { z } from 'zod';

/**
 * Prepara o zod para uma política de segurança de conteúdo (CSP) estrita.
 *
 * O zod testa se pode usar `new Function` para validar mais depressa. Com CSP esse teste
 * gera uma violação (mesmo que o erro seja apanhado). Com `jitless` o teste não é feito
 * e a validação usa o modo normal, sem `eval`.
 *
 * O teste acontece quando os esquemas são criados, ao carregar os módulos. Por isso este
 * ficheiro é importado no topo de cada módulo que define esquemas, antes de qualquer `z.object`.
 */
export function configureForStrictCsp(): void {
  z.config({ jitless: true });
}

configureForStrictCsp();
