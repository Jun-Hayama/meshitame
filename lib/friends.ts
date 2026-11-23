'use client'

// フレンドと一緒に食べる約束（docs/v2-spec.md 18章）のDBの読み書き
// 友だちに見せるのは friend_profiles と friend_progress（見せてよい値だけを書き出したもの）だけ。kg は書き出さない
// 計算は lib/calories.ts（buildFriendProgress・calcPromiseReadiness）。ここは読み込みと書き出しだけ

import { supabase } from '@/lib/supabase'
import { fetchReducePace } from '@/lib/reducePace'
import {
  buildFriendProgress,
  calcDailyIntakeFromPace,
  calcMealSlotTargets,
  calcMonthCheatStatus,
  calcPromiseReadiness,
  formatDateJST,
} from '@/lib/calories'
import { FRIEND_SYNC_DEBOUNCE_MS, FRIEND_SYNC_STALE_MS } from '@/lib/calorieConstants'
import type {
  CheatItemSelection,
  ExerciseLogRow,
  FriendInviteRow,
  FriendProfileRow,
  FriendProgressRow,
  GoalPlanRow,
  InviteStatus,
  InviteView,
  MealLogRow,
  MonthlyWantRow,
  PromiseMemberRow,
  PromisePlace,
  PromiseRow,
  WeightLog,
} from '@/types'

// --- 誘いのトークン（未ログインで開いたとき、ログイン・登録のあとに戻すために端末に保存する） ---

const JOIN_TOKEN_KEY = 'meshitame:join-token'
const TOKEN_PATTERN = /^[0-9a-f]{32}$/

export function isValidInviteToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

// 戻り先は /friends/join/ で始まるパスだけ
export function joinPath(token: string): string | null {
  return isValidInviteToken(token) ? `/friends/join/${token}` : null
}

export function savePendingJoinToken(token: string) {
  try {
    if (isValidInviteToken(token)) localStorage.setItem(JOIN_TOKEN_KEY, token)
  } catch {}
}

export function readPendingJoinToken(): string | null {
  try {
    const token = localStorage.getItem(JOIN_TOKEN_KEY)
    return token && isValidInviteToken(token) ? token : null
  } catch {
    return null
  }
}

export function clearPendingJoinToken() {
  try {
    localStorage.removeItem(JOIN_TOKEN_KEY)
  } catch {}
}

// 登録の確認メールの戻り先（別のブラウザで開いて保存したトークンが見つからないとき、今日の画面で一言出す）
export const INVITE_RETURN_QUERY = 'from=invite'

// --- 名前とキャラクター ---

export async function fetchMyProfile(userId: string): Promise<FriendProfileRow | null> {
  const { data, error } = await supabase.from('friend_profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return (data as FriendProfileRow) ?? null
}

export async function saveMyProfile(
  userId: string,
  values: Partial<Pick<FriendProfileRow, 'display_name' | 'character_emoji' | 'hide_cheats'>>
): Promise<FriendProfileRow> {
  const { data, error } = await supabase
    .from('friend_profiles')
    .upsert({ user_id: userId, ...values, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw error
  return data as FriendProfileRow
}

// --- 書き出し（friend_progress と自分の準備の具合） ---
// 裏で行い、失敗しても画面にエラーは出さない。記録が続いたときは最後の1回だけ

// 1000件ずつ全部読む（Supabase の1回の上限のため）
async function selectAll<T>(table: string, userId: string, column = 'user_id'): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').eq(column, userId).range(from, from + 999)
    if (error) throw error
    rows.push(...((data as T[]) ?? []))
    if (!data || data.length < 1000) return rows
  }
}

export async function syncFriendData(userId: string): Promise<void> {
  const today = formatDateJST(new Date())
  const profile = await fetchMyProfile(userId)
  if (!profile) return // 名前を決めるまでは友だちがいないので書き出さない

  const [{ data: goalData, error: goalErr }, weightLogs, wantRows, mealLogs, exerciseLogs, pace] = await Promise.all([
    supabase.from('goal_plans').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
    selectAll<WeightLog>('weight_logs', userId),
    selectAll<MonthlyWantRow>('monthly_wants', userId),
    selectAll<MealLogRow>('meal_logs', userId),
    selectAll<ExerciseLogRow>('exercise_logs', userId),
    fetchReducePace(userId),
  ])
  if (goalErr) throw goalErr
  const goal = (goalData as GoalPlanRow) ?? null
  const wants = wantRows.filter((w) => w.is_active)
  const slotTargets = goal ? calcMealSlotTargets(calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace)) : []
  const targetKg = goal ? Number(goal.target_weight_kg) : null

  const progress = buildFriendProgress({
    wants,
    mealLogs,
    exerciseLogs,
    slotTargets,
    today,
    logs: weightLogs,
    targetKg,
    hide: profile.hide_cheats,
  })
  const { error: upErr } = await supabase.from('friend_progress').upsert(
    {
      user_id: userId,
      approach_pct: progress.approachPct,
      detour: progress.detour,
      water_emoji: progress.waterEmoji,
      water_return_date: progress.waterReturnDate,
      footprints: progress.footprints,
      cheat_counts: progress.cheatCounts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (upErr) throw upErr

  // 自分の約束の準備の具合（今月の約束だけ%。先の月は null）
  const { data: memberData, error: memberErr } = await supabase.from('promise_members').select('*').eq('user_id', userId)
  if (memberErr) throw memberErr
  const members = (memberData as PromiseMemberRow[]) ?? []
  if (members.length === 0) return
  const { data: promiseData, error: promiseErr } = await supabase
    .from('promises')
    .select('*')
    .in('id', members.map((m) => m.promise_id))
    .eq('status', 'active')
    .gte('promise_date', today)
  if (promiseErr) throw promiseErr
  const status = calcMonthCheatStatus({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
    today,
    wants,
    mealLogs,
    exerciseLogs,
    slotTargets,
  })
  for (const p of (promiseData as PromiseRow[]) ?? []) {
    const m = members.find((x) => x.promise_id === p.id)
    if (!m) continue
    const ready = calcPromiseReadiness(status, m.cheat_id, p.promise_date, today)
    await supabase
      .from('promise_members')
      .update({ ready_pct: ready, updated_at: new Date().toISOString() })
      .eq('promise_id', p.id)
      .eq('user_id', userId)
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function runQuietly(userId: string) {
  syncFriendData(userId).catch((e) => console.warn('[friends] 書き出せませんでした', e))
}

// 記録・取り消しのあと。短い間隔で続いたら最後の1回だけ書き出す
export function scheduleFriendSync(userId: string | null) {
  if (!userId) return
  const prev = timers.get(userId)
  if (prev) clearTimeout(prev)
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId)
      runQuietly(userId)
    }, FRIEND_SYNC_DEBOUNCE_MS)
  )
}

// 今日の画面を開いたとき：前回の書き出しから1時間以上たっていれば
export function syncFriendDataIfStale(userId: string) {
  supabase
    .from('friend_progress')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) return
      const last = (data as { updated_at: string } | null)?.updated_at
      if (!last || Date.now() - new Date(last).getTime() >= FRIEND_SYNC_STALE_MS) scheduleFriendSync(userId)
    })
}

// --- 読み込み（/friends と今日の画面のカード） ---

export interface FriendPerson {
  userId: string
  name: string
  character: string
  progress: FriendProgressRow | null
  isMe: boolean
}

export interface PromiseMemberView {
  userId: string
  name: string
  character: string
  readyPct: number | null
  isMe: boolean
}

export interface PromiseView {
  promise: PromiseRow
  members: PromiseMemberView[]
  isCreator: boolean
  myCheatId: string | null
}

export interface FriendOverview {
  profile: FriendProfileRow | null
  me: FriendPerson | null
  friends: FriendPerson[]
  promises: PromiseView[]
  invites: FriendInviteRow[] // 自分が作った、まだ使える招待
}

export async function loadFriendOverview(userId: string): Promise<FriendOverview> {
  const profile = await fetchMyProfile(userId)
  if (!profile) return { profile: null, me: null, friends: [], promises: [], invites: [] }

  const [{ data: fsData, error: fsErr }, { data: memberData, error: memberErr }, { data: inviteData, error: inviteErr }] =
    await Promise.all([
      supabase.from('friendships').select('friend_id').eq('user_id', userId),
      supabase.from('promise_members').select('promise_id').eq('user_id', userId),
      supabase
        .from('friend_invites')
        .select('*')
        .eq('creator_id', userId)
        .is('stopped_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ])
  const err = fsErr ?? memberErr ?? inviteErr
  if (err) throw err
  const friendIds = ((fsData as { friend_id: string }[]) ?? []).map((f) => f.friend_id)
  const promiseIds = ((memberData as { promise_id: string }[]) ?? []).map((m) => m.promise_id)

  const [{ data: promiseData, error: pErr }, { data: allMemberData, error: amErr }] = promiseIds.length
    ? await Promise.all([
        supabase.from('promises').select('*').in('id', promiseIds),
        supabase.from('promise_members').select('*').in('promise_id', promiseIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (pErr ?? amErr) throw pErr ?? amErr
  const allMembers = (allMemberData as PromiseMemberRow[]) ?? []

  const peopleIds = [...new Set([userId, ...friendIds, ...allMembers.map((m) => m.user_id)])]
  const [{ data: profileData, error: prErr }, { data: progressData, error: pgErr }] = await Promise.all([
    supabase.from('friend_profiles').select('*').in('user_id', peopleIds),
    supabase.from('friend_progress').select('*').in('user_id', [userId, ...friendIds]),
  ])
  if (prErr ?? pgErr) throw prErr ?? pgErr
  const profiles = new Map(((profileData as FriendProfileRow[]) ?? []).map((p) => [p.user_id, p]))
  const progresses = new Map(((progressData as FriendProgressRow[]) ?? []).map((p) => [p.user_id, p]))

  const person = (id: string): FriendPerson | null => {
    const p = profiles.get(id)
    return p ? { userId: id, name: p.display_name, character: p.character_emoji, progress: progresses.get(id) ?? null, isMe: id === userId } : null
  }
  const promises: PromiseView[] = ((promiseData as PromiseRow[]) ?? []).map((promise) => {
    const rows = allMembers
      .filter((m) => m.promise_id === promise.id)
      .sort((a, b) => (a.user_id === userId ? -1 : b.user_id === userId ? 1 : a.joined_at.localeCompare(b.joined_at)))
    return {
      promise,
      isCreator: promise.creator_id === userId,
      myCheatId: rows.find((m) => m.user_id === userId)?.cheat_id ?? null,
      members: rows.map((m) => {
        const p = profiles.get(m.user_id)
        return {
          userId: m.user_id,
          name: p?.display_name ?? '',
          character: p?.character_emoji ?? '🐷',
          readyPct: m.ready_pct,
          isMe: m.user_id === userId,
        }
      }),
    }
  })

  return {
    profile,
    me: person(userId),
    friends: friendIds.map(person).filter((p): p is FriendPerson => p !== null),
    promises,
    invites: (inviteData as FriendInviteRow[]) ?? [],
  }
}

// --- 関数（security definer）の呼び出し ---

export async function createPromise(values: {
  date: string
  place: PromisePlace
  items: CheatItemSelection[]
  label: string
  venue: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_promise', {
    p_date: values.date,
    p_place: values.place,
    p_items: values.items,
    p_label: values.label,
    p_venue: values.venue,
  })
  if (error) throw error
  return data as string
}

// 約束のチートの id（自分の行だけ更新できる）
export async function setPromiseCheat(promiseId: string, userId: string, cheatId: string) {
  const { error } = await supabase
    .from('promise_members')
    .update({ cheat_id: cheatId, updated_at: new Date().toISOString() })
    .eq('promise_id', promiseId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function createInvite(promiseId: string | null = null): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', { p_promise_id: promiseId })
  if (error) throw error
  return data as string
}

export async function stopInvite(token: string) {
  const { error } = await supabase.rpc('stop_invite', { p_token: token })
  if (error) throw error
}

export async function getInvite(token: string): Promise<InviteView> {
  const { data, error } = await supabase.rpc('get_invite', { p_token: token })
  if (error) throw error
  return data as InviteView
}

export async function joinInvite(token: string): Promise<{
  status: InviteStatus
  promise: { id: string; date: string; place: PromisePlace; items: CheatItemSelection[]; label: string } | null
}> {
  const { data, error } = await supabase.rpc('join_invite', { p_token: token })
  if (error) throw error
  return data
}

export async function cancelPromise(promiseId: string) {
  const { error } = await supabase.rpc('cancel_promise', { p_promise_id: promiseId })
  if (error) throw error
}

export async function leavePromise(promiseId: string) {
  const { error } = await supabase.rpc('leave_promise', { p_promise_id: promiseId })
  if (error) throw error
}

export async function unfriend(friendId: string) {
  const { error } = await supabase.rpc('unfriend', { p_friend_id: friendId })
  if (error) throw error
}

// --- 誘いのリンクを送る（Web Share API。使えなければコピー） ---

export function inviteUrl(token: string): string {
  return `${window.location.origin}/friends/join/${token}`
}

export async function shareInvite(token: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteUrl(token)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'メシため', text, url })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'failed'
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}

// 関数のエラー・状態をわかる言葉に
export const INVITE_STATUS_MESSAGES: Record<Exclude<InviteStatus, 'ok'>, string> = {
  not_found: 'このリンクは見つかりませんでした。',
  own: '自分の誘いのリンクです。友だちに送ってください。',
  stopped: 'このリンクは止められています。',
  expired: 'このリンクは期限が切れています。新しいリンクをもらってください。',
  canceled: 'この約束は取りやめになりました。',
  past: 'この約束の日は過ぎています。',
  already: 'すでに参加しています。',
  full: 'この約束は6人そろっています。',
  friend_limit: '友だちが10人そろっているので、参加できません。',
  no_profile: '先に名前とキャラクターを決めてください。',
}

export function describeFriendError(e: unknown): string {
  const err = e as { message?: string; code?: string }
  const m = err?.message ?? ''
  if (err?.code === '42P01' || err?.code === 'PGRST202' || m.includes('relation') || m.includes('Could not find the function')) {
    return 'DBの migration_v2_8_friends.sql を Supabase で実行してください'
  }
  if (m.includes('bad_date')) return '日付は明日から60日以内にしてください'
  if (m.includes('no_profile')) return INVITE_STATUS_MESSAGES.no_profile
  if (m.includes('not_creator')) return '約束を作った人だけができます'
  if (m.includes('creator')) return '作った人は抜けられません。取りやめにしてください'
  if (m.includes('expired')) return '約束の日が近いので、もう誘えません'
  if (m.includes('canceled')) return INVITE_STATUS_MESSAGES.canceled
  return m || 'うまくいきませんでした'
}
