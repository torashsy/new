/** 入力の上限。"use server" のファイルからは定数を export できないので分けてある。 */
export const ANSWER_LIMIT = 140;
export const BIO_LIMIT = 140;
export const MAX_TAGS = 8;

/**
 * 1日に送れる「もっと知りたい」の数。
 * 無制限だと「全員に送る」が最適戦略になり、選ぶという行為の意味がなくなる。
 * 数字は運用しながら決めるしかないので、ここ一箇所で変えられるようにしておく。
 */
export const MAX_INTERESTS_PER_DAY = 5;
