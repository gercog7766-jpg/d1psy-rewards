export const promoRewardTypes = {
  coins: 'Монеты',
  prize: 'Скин',
  major_pass: 'Пропуск Major Pick’em',
  major_tokens: 'Жетоны Major Pick’em',
  vault_keys: 'Ключи THE VAULT',
  upgrade_skin: 'Скин только для апгрейдера',
  three_doors_pass: 'Одна игра в «Три двери»',
  pick_credit: 'Баланс для Pick',
} as const;

export const promoRewardBrowserScript = String.raw`
function rewardLabel(type,amount) {
  const labels=${JSON.stringify(promoRewardTypes)};
  if(type==='coins')return 'Монеты · '+amount;
  if(type==='major_tokens')return 'Жетоны Major Pick’em · '+amount;
  if(type==='vault_keys')return 'Ключи THE VAULT · '+amount;
  if(type==='three_doors_pass')return 'Одна игра в «Три двери» · вход за '+amount+' монет';
  if(type==='pick_credit')return 'Баланс для Pick · '+amount+' монет';
  return labels[type] || 'Награда';
}
function promoRewardMessage(result) {
  if(result.rewardType==='coins')return 'На баланс начислено '+result.amount+' монет.';
  if(result.rewardType==='prize')return 'Скин добавлен в инвентарь.';
  if(result.rewardType==='upgrade_skin')return 'Скин доступен в «Апгрейдере».';
  if(result.rewardType==='major_pass')return 'Пропуск Major Pick’em активирован.';
  return 'Получено: '+rewardLabel(result.rewardType,result.amount)+'.';
}
function promoErrorMessage(error) {
  return ({
    already_used:'Вы уже активировали этот промокод',
    limit_reached:'Лимит активаций промокода исчерпан',
    expired:'Срок действия промокода истёк',
    new_users_only:'Этот промокод доступен только новым пользователям',
    major_already_active:'У тебя уже активирован пропуск Major Pick’em.',
    major_pass_required:'Для этой награды нужен активированный пропуск Major Pick’em.',
    major_closed:'Сейчас активация пропусков Major Pick’em закрыта.',
    vault_closed:'Сейчас начисление ключей THE VAULT закрыто.',
    vault_key_limit:'Эта награда превышает твой оставшийся недельный лимит ключей.',
    user_unavailable:'Награда недоступна для твоего аккаунта.',
    reward_failed:'Не удалось выдать награду. Попробуй ещё раз.',
  })[error] || 'Промокод недействителен';
}
`;
