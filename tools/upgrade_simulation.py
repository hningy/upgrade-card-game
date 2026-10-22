from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Iterable


SUITS = ("H", "D", "C", "S")
SUIT_NAMES = {"H": "红桃", "D": "方片", "C": "梅花", "S": "黑桃"}
RANKS = ("2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A")
RANK_VALUE = {rank: index + 2 for index, rank in enumerate(RANKS)}
LEVELS = RANKS
SCORE_VALUE = {"K": 10, "10": 10, "5": 5}

ORDER = ("blue1", "red2", "blue2", "red1")
TEAM = {"blue1": "blue", "blue2": "blue", "red1": "red", "red2": "red"}
PARTNER = {"blue1": "blue2", "blue2": "blue1", "red1": "red2", "red2": "red1"}
TEAM_PLAYERS = {"blue": ("blue1", "blue2"), "red": ("red1", "red2")}
OTHER_TEAM = {"blue": "red", "red": "blue"}


@dataclass(frozen=True)
class Card:
    suit: str | None
    rank: str

    @property
    def is_joker(self) -> bool:
        return self.rank in ("BJ", "SJ")

    def __str__(self) -> str:
        if self.is_joker:
            return "大王" if self.rank == "BJ" else "小王"
        return f"{SUIT_NAMES[self.suit]}{self.rank}"


def score_value(card: Card) -> int:
    return SCORE_VALUE.get(card.rank, 0)


def full_deck() -> list[Card]:
    deck = [Card(suit, rank) for suit in SUITS for rank in RANKS]
    deck.extend((Card(None, "BJ"), Card(None, "SJ")))
    return deck


class Engine:
    def __init__(self, level: str, trump_suit: str | None, main_team: str):
        if level not in RANK_VALUE:
            raise ValueError(f"非法级别: {level}")
        if trump_suit is not None and trump_suit not in SUITS:
            raise ValueError(f"非法花色: {trump_suit}")
        self.level = level
        self.trump_suit = trump_suit
        self.main_team = main_team
        self.opponent_team = OTHER_TEAM[main_team]

    def is_trump(self, card: Card) -> bool:
        if card.is_joker or card.rank == self.level:
            return True
        return self.trump_suit is not None and card.suit == self.trump_suit

    def strength(self, card: Card) -> tuple[int, int]:
        """Return a comparable strength tuple under this hand's rules."""
        if card.rank == "BJ":
            return (6, 0)
        if card.rank == "SJ":
            return (5, 0)
        if card.rank == self.level:
            if self.trump_suit is not None and card.suit == self.trump_suit:
                return (4, 0)
            return (3, 0)
        if self.trump_suit is not None and card.suit == self.trump_suit:
            return (2, RANK_VALUE[card.rank])
        return (1, RANK_VALUE[card.rank])

    def is_score_hand(self, hand: Iterable[Card]) -> bool:
        return any(score_value(card) > 0 for card in hand)


@dataclass
class MatchState:
    levels: dict[str, str] = field(default_factory=lambda: {"blue": "2", "red": "2"})
    rounds_won: dict[str, int] = field(default_factory=lambda: {"blue": 0, "red": 0})
    main_team: str | None = None
    shootout: bool = True

    def advance_level(self, team: str, amount: int) -> None:
        index = LEVELS.index(self.levels[team])
        for _ in range(amount):
            index = (index + 1) % len(LEVELS)
            if LEVELS[index] == "2":
                self.rounds_won[team] += 1
        self.levels[team] = LEVELS[index]


@dataclass
class Bid:
    caller: str
    trump_suit: str | None


@dataclass
class HandStats:
    redeals: int = 0
    regular_no_call: bool = False
    no_trump: bool = False
    revolution_checks: int = 0
    revolutions: int = 0
    tricks: int = 0
    throw_attempts: int = 0
    throw_successes: int = 0
    throw_failures: int = 0
    trump_groups: int = 0
    points: int = 0
    last_winner: str | None = None
    bottom_discard_points: int = 0
    main_team: str | None = None
    opponent_team: str | None = None
    upgrade_team: str | None = None
    upgrade_amount: int = 0
    next_shootout: bool = False


def deal(deck: list[Card], start_player: str) -> tuple[dict[str, list[Card]], list[Card]]:
    hands = {player: [] for player in ORDER}
    start = ORDER.index(start_player)
    for index, card in enumerate(deck[:48]):
        hands[ORDER[(start + index) % len(ORDER)]].append(card)
    bottom = deck[48:]
    assert all(len(hand) == 12 for hand in hands.values())
    assert len(bottom) == 6
    return hands, bottom


def call_candidates(hand: Iterable[Card], level: str, allow_joker: bool) -> list[str | None]:
    hand = list(hand)
    candidates: list[str | None] = []
    suits = {card.suit for card in hand if card.rank == level}
    candidates.extend(sorted(suit for suit in suits if suit is not None))
    if allow_joker and any(card.is_joker for card in hand):
        candidates.append(None)
    return candidates


def choose_call_suit(hand: list[Card], candidates: list[str | None], level: str) -> str | None:
    def value(suit: str | None) -> tuple[int, int]:
        if suit is None:
            return (0, 0)
        count = sum(card.suit == suit for card in hand)
        has_level = any(card.suit == suit and card.rank == level for card in hand)
        return (int(has_level), count)

    return max(candidates, key=value)


def deal_and_bid(
    rng: random.Random,
    level_for_player: dict[str, str],
    allow_joker: bool,
    call_rate: float = 1.0,
    start_player: str | None = None,
) -> tuple[dict[str, list[Card]], list[Card], Bid | None]:
    start_player = start_player or rng.choice(ORDER)
    deck = full_deck()
    rng.shuffle(deck)
    hands = {player: [] for player in ORDER}
    start = ORDER.index(start_player)
    bid: Bid | None = None

    for index, card in enumerate(deck[:48]):
        receiver = ORDER[(start + index) % len(ORDER)]
        hands[receiver].append(card)
        if bid is not None:
            continue
        for player in ORDER:
            candidates = call_candidates(
                hands[player],
                level_for_player[player],
                allow_joker=allow_joker,
            )
            if candidates and rng.random() < call_rate:
                suit = choose_call_suit(hands[player], candidates, level_for_player[player])
                bid = Bid(caller=player, trump_suit=suit)
                break

    return hands, deck[48:], bid


def choose_bottom_player(main_team: str, rng: random.Random) -> str:
    first, second = TEAM_PLAYERS[main_team]
    first_wants = rng.choice((True, False))
    second_wants = rng.choice((True, False))
    if first_wants != second_wants:
        return first if first_wants else second
    return rng.choice((first, second))


def discard_six(hand: list[Card], engine: Engine) -> list[Card]:
    if len(hand) not in (17, 18):
        raise AssertionError(f"打底前手牌数量异常: {len(hand)}")

    # There are only 12 scoring cards in a 54-card deck, so a 17-card hand
    # always contains at least five zero-score cards. Taking the six cheapest
    # cards therefore costs at most 5 points, well below the 25-point limit.
    chosen = sorted(
        hand,
        key=lambda card: (
            score_value(card),
            engine.is_trump(card),
            RANK_VALUE.get(card.rank, 99),
        ),
    )[:6]
    if sum(score_value(card) for card in chosen) > 25:
        raise AssertionError("找不到合法的六张弃牌")
    return chosen


def remove_cards(hand: list[Card], cards: Iterable[Card]) -> None:
    cards = list(cards)
    if len(cards) != len(set(cards)):
        raise AssertionError("同一组牌中存在重复牌")
    for card in cards:
        try:
            hand.remove(card)
        except ValueError as error:
            raise AssertionError(f"手牌中不存在要移除的牌: {card}") from error


def process_bottom(
    hands: dict[str, list[Card]],
    bottom: list[Card],
    bid: Bid | None,
    level: str,
    main_team: str,
    rng: random.Random,
) -> tuple[str, list[Card], list[Card], str | None]:
    bottom_player = choose_bottom_player(main_team, rng)
    special_card: list[Card] = []
    if bid is None:
        special_index = rng.randrange(len(bottom))
        special = bottom.pop(special_index)
        special_card.append(special)

    hands[bottom_player].extend(bottom)
    if bid is None:
        assert len(hands[bottom_player]) == 17
    else:
        assert len(hands[bottom_player]) == 18

    # A suit is needed to choose a reasonable discard; the actual trump suit is
    # still resolved after discarding in the no-bid path below.
    provisional_suit = bid.trump_suit if bid is not None else None
    provisional_engine = Engine(level=level, trump_suit=provisional_suit, main_team=main_team)
    discard = discard_six(hands[bottom_player], provisional_engine)
    remove_cards(hands[bottom_player], discard)

    if bid is None:
        assert len(hands[bottom_player]) == 11
        hands[bottom_player].extend(special_card)
        trump_suit = special_card[0].suit
    else:
        trump_suit = bid.trump_suit
        assert len(hands[bottom_player]) == 12

    assert len(hands[bottom_player]) == 12
    return bottom_player, discard, special_card, trump_suit


def validate_throw(
    group: list[Card],
    hands: dict[str, list[Card]],
    leader: str,
    engine: Engine,
) -> bool:
    if len(group) < 2:
        raise ValueError("甩牌必须至少两张")
    if len({card.suit for card in group}) != 1:
        raise ValueError("甩牌必须同花色")
    if any(engine.is_trump(card) for card in group):
        raise ValueError("主牌不能甩")

    suit = group[0].suit
    minimum_rank = min(RANK_VALUE[card.rank] for card in group)
    for player, hand in hands.items():
        if player == leader:
            continue
        if any(card.suit == suit and RANK_VALUE[card.rank] > minimum_rank for card in hand):
            return False
    return True


def legal_follow_group(
    hand: list[Card],
    lead: list[Card],
    engine: Engine,
    rng: random.Random,
) -> list[Card]:
    count = len(lead)
    lead_card = lead[0]
    if count == 1:
        if engine.is_trump(lead_card):
            candidates = [card for card in hand if engine.is_trump(card)]
        else:
            candidates = [card for card in hand if not engine.is_trump(card) and card.suit == lead_card.suit]
        if candidates:
            return [rng.choice(candidates)]
        return [rng.choice(hand)]

    if any(engine.is_trump(card) for card in lead):
        raise AssertionError("多张主牌不可能是合法首牌")
    lead_suit = lead_card.suit
    same_suit = [card for card in hand if card.suit == lead_suit and not engine.is_trump(card)]
    if len(same_suit) >= count:
        return rng.sample(same_suit, count)

    if same_suit:
        remaining = [card for card in hand if card not in same_suit]
        return same_suit + rng.sample(remaining, count - len(same_suit))

    trumps = [card for card in hand if engine.is_trump(card)]
    if len(trumps) >= count and rng.random() < 0.35:
        return rng.sample(trumps, count)
    return rng.sample(hand, count)


def choose_lead(
    hand: list[Card],
    engine: Engine,
    rng: random.Random,
) -> list[Card]:
    if len(hand) >= 2 and rng.random() < 0.28:
        suits: dict[str, list[Card]] = defaultdict(list)
        for card in hand:
            if not engine.is_trump(card) and card.suit is not None:
                suits[card.suit].append(card)
        possible = [(suit, cards) for suit, cards in suits.items() if len(cards) >= 2]
        if possible:
            _, cards = rng.choice(possible)
            if rng.random() < 0.55:
                ranked = sorted(cards, key=lambda card: RANK_VALUE[card.rank], reverse=True)
                return ranked[: rng.choice((2, min(3, len(ranked))))]
            return rng.sample(cards, 2)
    return [rng.choice(hand)]


def trick_winner(
    lead: list[Card],
    plays: list[tuple[str, list[Card]]],
    engine: Engine,
) -> str:
    leader = plays[0][0]
    if len(lead) == 1:
        lead_card = lead[0]
        leading_trump = engine.is_trump(lead_card)
        best_player = leader
        best_strength = (-1, -1)
        for player, group in plays:
            card = group[0]
            eligible = engine.is_trump(card) if leading_trump else (
                not engine.is_trump(card) and card.suit == lead_card.suit
            )
            if not eligible:
                continue
            strength = engine.strength(card)
            if strength > best_strength:
                best_player = player
                best_strength = strength
        return best_player

    if any(engine.is_trump(card) for card in lead):
        raise AssertionError("多张首牌中不能包含主牌")

    best_player = leader
    best_strength = (-1, -1)
    for player, group in plays[1:]:
        if all(engine.is_trump(card) for card in group):
            strength = max(engine.strength(card) for card in group)
            if strength > best_strength:
                best_player = player
                best_strength = strength
    return best_player


def play_hand(
    hands: dict[str, list[Card]],
    first_player: str,
    engine: Engine,
    discarded: list[Card],
    rng: random.Random,
    stats: HandStats,
) -> None:
    played: list[Card] = []
    points = 0
    last_winner = first_player

    while any(hands.values()):
        sizes = {len(hand) for hand in hands.values()}
        if len(sizes) != 1:
            raise AssertionError(f"每墩开始前手牌数量不相等: {sizes}")
        if next(iter(sizes)) == 0:
            break

        intended_lead = choose_lead(hands[first_player], engine, rng)
        if len(intended_lead) > 1:
            stats.throw_attempts += 1
            if validate_throw(intended_lead, hands, first_player, engine):
                actual_lead = intended_lead
                stats.throw_successes += 1
            else:
                cards = sorted(intended_lead, key=lambda card: RANK_VALUE[card.rank])
                actual_lead = [cards[0]]
                stats.throw_failures += 1
        else:
            actual_lead = intended_lead

        remove_cards(hands[first_player], actual_lead)
        plays: list[tuple[str, list[Card]]] = [(first_player, actual_lead)]
        start = ORDER.index(first_player)
        for offset in range(1, 4):
            player = ORDER[(start + offset) % len(ORDER)]
            group = legal_follow_group(hands[player], actual_lead, engine, rng)
            remove_cards(hands[player], group)
            plays.append((player, group))
            if len(group) > 1 and all(engine.is_trump(card) for card in group):
                stats.trump_groups += 1

        post_trick_sizes = {len(hand) for hand in hands.values()}
        if len(post_trick_sizes) != 1:
            raise AssertionError(f"每墩结束后手牌数量不相等: {post_trick_sizes}")

        winner = trick_winner(actual_lead, plays, engine)
        trick_cards = actual_lead + [card for _, group in plays[1:] for card in group]
        trick_points = sum(score_value(card) for card in trick_cards)
        is_final_trick = all(not hand for hand in hands.values())
        if TEAM[winner] == engine.opponent_team and not is_final_trick:
            points += trick_points
        played.extend(trick_cards)
        if len(set(played)) != len(played):
            raise AssertionError("出牌流中出现重复牌")
        last_winner = winner
        first_player = winner
        stats.tricks += 1

    if any(hands.values()):
        raise AssertionError("牌局结束时仍有玩家持有手牌")
    all_accounted = played + discarded
    if Counter(all_accounted) != Counter(full_deck()):
        raise AssertionError("已出牌加弃牌没有完整覆盖 54 张牌")
    if points > 100:
        raise AssertionError(f"旁家分数异常: {points}")
    stats.points = points
    stats.last_winner = last_winner


def settle_match(
    state: MatchState,
    main_team: str,
    points: int,
    last_winner: str,
) -> tuple[str, int, bool]:
    opponent_team = OTHER_TEAM[main_team]
    if points == 0:
        if TEAM[last_winner] == main_team:
            state.advance_level(main_team, 2)
            return main_team, 2, False
        return main_team, 0, True
    if points == 40:
        return main_team, 0, True
    if points < 45:
        state.advance_level(main_team, 1)
        return main_team, 1, False
    if points < 65:
        state.advance_level(opponent_team, 1)
        return opponent_team, 1, False

    state.advance_level(opponent_team, 2)
    return opponent_team, 2, False


def simulate_hand(
    state: MatchState,
    rng: random.Random,
    call_rate: float = 1.0,
    force_no_call: bool = False,
    revolution_agreement: float = 0.5,
    max_redeals: int = 200,
) -> HandStats:
    stats = HandStats()
    original_main = state.main_team
    original_shootout = state.shootout

    for _ in range(max_redeals):
        if original_shootout:
            level_for_player = {player: state.levels[TEAM[player]] for player in ORDER}
            hands, bottom, bid = deal_and_bid(
                rng,
                level_for_player=level_for_player,
                allow_joker=False,
                call_rate=0.0 if force_no_call else call_rate,
            )
            if bid is None:
                stats.redeals += 1
                continue
            main_team = TEAM[bid.caller]
        else:
            assert original_main is not None
            main_team = original_main
            level = state.levels[main_team]
            hands, bottom, bid = deal_and_bid(
                rng,
                level_for_player={player: level for player in ORDER},
                allow_joker=True,
                call_rate=0.0 if force_no_call else call_rate,
            )

        stats.revolution_checks += 1
        opponent_players = TEAM_PLAYERS[OTHER_TEAM[main_team]]
        zero_score_players = [
            player
            for player in opponent_players
            if not any(score_value(card) > 0 for card in hands[player])
        ]
        if zero_score_players and rng.random() < revolution_agreement:
            stats.revolutions += 1
            stats.redeals += 1
            continue
        break
    else:
        raise AssertionError("超过重发次数仍未形成可执行的牌局")

    if original_shootout:
        state.main_team = main_team
        state.shootout = False
    level = state.levels[main_team]
    assert bid is not None or not original_shootout
    stats.main_team = main_team
    stats.opponent_team = OTHER_TEAM[main_team]
    stats.regular_no_call = bid is None

    bottom_player, discard, special_card, trump_suit = process_bottom(
        hands, bottom, bid, level, main_team, rng
    )
    stats.bottom_discard_points = sum(score_value(card) for card in discard)
    if stats.bottom_discard_points > 25:
        raise AssertionError("底牌弃牌超过 25 分")
    stats.no_trump = trump_suit is None

    initial_ids = {card for hand in hands.values() for card in hand} | set(discard)
    if initial_ids != set(full_deck()):
        raise AssertionError("打底后牌张没有完整覆盖 54 张")

    engine = Engine(level=level, trump_suit=trump_suit, main_team=main_team)
    play_hand(hands, bottom_player, engine, discard, rng, stats)
    assert stats.last_winner is not None

    next_main, upgrade_amount, next_shootout = settle_match(
        state, main_team, stats.points, stats.last_winner
    )
    stats.upgrade_team = next_main if upgrade_amount else None
    stats.upgrade_amount = upgrade_amount
    stats.next_shootout = next_shootout
    state.main_team = next_main
    state.shootout = next_shootout
    return stats


def assert_raises_value_error(function, *args) -> None:
    try:
        function(*args)
    except ValueError:
        return
    raise AssertionError("预期抛出 ValueError")


def run_unit_tests() -> list[str]:
    results: list[str] = []
    deck = full_deck()
    assert len(deck) == 54 and len(set(deck)) == 54
    results.append("54 张牌唯一且完整")

    heart_engine = Engine("7", "H", "blue")
    ordered = [
        Card(None, "BJ"),
        Card(None, "SJ"),
        Card("H", "7"),
        Card("S", "7"),
        Card("H", "A"),
        Card("H", "K"),
        Card("S", "A"),
    ]
    strengths = [heart_engine.strength(card) for card in ordered]
    assert all(left > right for left, right in zip(strengths, strengths[1:]))
    assert heart_engine.strength(Card("D", "7")) == heart_engine.strength(Card("S", "7"))
    results.append("有令花色时主牌强弱顺序正确")

    no_suit_engine = Engine("7", None, "blue")
    assert no_suit_engine.strength(Card("S", "7")) > no_suit_engine.strength(Card("H", "A"))
    assert no_suit_engine.strength(Card(None, "SJ")) > no_suit_engine.strength(Card("S", "7"))
    results.append("无令花色时级牌仍是主牌")

    throw_hands = {
        "blue1": [Card("S", "A"), Card("S", "Q"), Card("H", "3")],
        "blue2": [Card("S", "K")],
        "red1": [Card("H", "4")],
        "red2": [Card("H", "6")],
    }
    assert not validate_throw(
        [Card("S", "A"), Card("S", "Q")],
        throw_hands,
        "blue1",
        heart_engine,
    )
    results.append("队友持有更大同花色牌会使甩牌失败")

    del throw_hands["blue2"][0]
    assert validate_throw(
        [Card("S", "A"), Card("S", "Q")],
        throw_hands,
        "blue1",
        heart_engine,
    )
    results.append("其他人都压不过时甩牌成功")

    plays = [
        ("blue1", [Card("S", "A"), Card("S", "K")]),
        ("red2", [Card("H", "2"), Card("H", "3")]),
        ("blue2", [Card("D", "4"), Card("H", "4")]),
        ("red1", [Card("C", "3")]),
    ]
    assert trick_winner(plays[0][1], plays, heart_engine) == "red2"
    results.append("整组主牌可压甩牌，混牌不参与赢墩")

    state = MatchState()
    state.advance_level("blue", 2)
    assert state.levels["blue"] == "4"
    state.levels["blue"] = "K"
    state.advance_level("blue", 2)
    assert state.levels["blue"] == "2"
    state.levels["blue"] = "A"
    state.advance_level("blue", 2)
    assert state.levels["blue"] == "3"
    results.append("跨 A 与经过 2 的升级循环正确")

    cases = [
        (0, "blue1", "blue", 2, False),
        (0, "red1", None, 0, True),
        (1, "red1", "blue", 1, False),
        (40, "blue1", None, 0, True),
        (44, "red1", "blue", 1, False),
        (45, "blue1", "red", 1, False),
        (64, "blue1", "red", 1, False),
        (65, "blue1", "red", 2, False),
    ]
    for points, last_winner, expected_team, amount, next_shootout in cases:
        probe = MatchState(levels={"blue": "7", "red": "5"}, main_team="blue", shootout=False)
        actual_team, actual_amount, actual_shootout = settle_match(
            probe, "blue", points, last_winner
        )
        assert (actual_team if actual_amount else None, actual_amount, actual_shootout) == (
            expected_team,
            amount,
            next_shootout,
        )
    results.append("0、40、44、45、64、65 分边界结算正确")

    rng = random.Random(20261022)
    hands = {player: [] for player in ORDER}
    deck_copy = full_deck()
    rng.shuffle(deck_copy)
    for index, card in enumerate(deck_copy[:48]):
        hands[ORDER[index % 4]].append(card)
    bottom = deck_copy[48:]
    bottom_player, discard, special, trump_suit = process_bottom(
        hands, bottom, bid=None, level="7", main_team="blue", rng=rng
    )
    assert len(special) == 1
    assert len(discard) == 6
    assert len(hands[bottom_player]) == 12
    assert set(card for hand in hands.values() for card in hand) | set(discard) | set(special) == set(full_deck())
    results.append("无人叫主时 17→11→12 张流程正确")

    assert all(score_value(card) <= 10 for card in deck)
    assert sum(score_value(card) for card in deck) == 100
    results.append("分牌数值总计 100 分")
    return results


def run_monte_carlo(hands: int, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    state = MatchState()
    stats = [simulate_hand(state, rng) for _ in range(hands)]
    counters = Counter()
    tricks: list[int] = []
    for item in stats:
        counters["redeals"] += item.redeals
        counters["regular_no_call"] += int(item.regular_no_call)
        counters["no_trump"] += int(item.no_trump)
        counters["revolution_checks"] += item.revolution_checks
        counters["revolutions"] += item.revolutions
        counters["throw_attempts"] += item.throw_attempts
        counters["throw_successes"] += item.throw_successes
        counters["throw_failures"] += item.throw_failures
        counters["trump_groups"] += item.trump_groups
        counters["shootout_hands"] += int(item.next_shootout)
        tricks.append(item.tricks)

    probes = []
    # Force the ordinary no-call path and revolution path in independent probes.
    for probe_index in range(min(hands, 100)):
        probe_state = MatchState(
            levels={"blue": "7", "red": "5"},
            main_team="blue",
            shootout=False,
        )
        probes.append(
            simulate_hand(
                probe_state,
                rng,
                force_no_call=True,
                revolution_agreement=0.0,
            )
        )

    return {
        "hands": hands,
        "seed": seed,
        "state": state,
        "counters": counters,
        "tricks": tricks,
        "no_call_probes": len(probes),
        "no_call_probe_triggers": sum(item.regular_no_call for item in probes),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="升级规则可行性模拟器")
    parser.add_argument("--hands", type=int, default=2000, help="随机模拟的完整牌局数")
    parser.add_argument("--seed", type=int, default=20261022, help="随机种子")
    args = parser.parse_args()

    print("规则边界测试")
    for line in run_unit_tests():
        print(f"  PASS  {line}")

    report = run_monte_carlo(args.hands, args.seed)
    counters: Counter = report["counters"]
    tricks: list[int] = report["tricks"]
    state: MatchState = report["state"]

    print("\n随机批量模拟")
    print(f"  seed={report['seed']} hands={report['hands']}")
    print(f"  牌局重发次数={counters['redeals']}")
    print(f"  普通无人叫主={counters['regular_no_call']}")
    print(f"  无令花色牌局={counters['no_trump']}")
    print(f"  起义同意次数={counters['revolutions']}/{counters['revolution_checks']}")
    print(
        "  甩牌尝试/成功/失败="
        f"{counters['throw_attempts']}/{counters['throw_successes']}/{counters['throw_failures']}"
    )
    print(f"  整组主牌载牌次数={counters['trump_groups']}")
    print(f"  每局墩数范围={min(tricks)}～{max(tricks)}")
    print(f"  普通无人叫主强制探针={report['no_call_probe_triggers']}/{report['no_call_probes']}")
    print(f"  最终蓝方级别={state.levels['blue']}，完成圈数={state.rounds_won['blue']}")
    print(f"  最终红方级别={state.levels['red']}，完成圈数={state.rounds_won['red']}")
    print("\n所有手牌数量、牌张守恒、牌型、分数和升级不变量检查均通过。")


if __name__ == "__main__":
    main()
