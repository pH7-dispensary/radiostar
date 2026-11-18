"""Planning scenarios from recorded usage; never changes budgets or calls providers."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1]
measured = json.loads((root / "evals/intelligence-engine-economics.json").read_text())
overhead = measured["measuredNonAudioUsdPerSourceHour"]
audio_rate = measured["measuredAudioUsdPerHour"]
aws_base = measured["existingAws30DayRunRateUsd"]
net_translate_usd = 14.99 / 1.20 * 0.85 * 1.25
scenarios = []
for users, unique_shows in [(100, 35), (1000, 140), (10000, 420)]:
    unique_hours = unique_shows / 7
    fresh = unique_hours * .2
    derived = unique_hours * .4
    daily_model = fresh * audio_rate + derived * overhead
    initial_hours = unique_shows * 3
    preparation_days_floor = max(math.ceil(initial_hours * .2 / 3), math.ceil(initial_hours * .4 * overhead / 5))
    sustained = fresh <= 3 and daily_model <= 5 and daily_model * 30 <= 25
    operating_floor = aws_base + daily_model * 30
    scenarios.append({
        "activeUsers": users, "distinctFollowedShows": unique_shows,
        "incomingUniqueAudioHoursPerDay": unique_hours,
        "freshTranscriptionHoursPerDay": fresh,
        "derivedPreparationSourceHoursPerDay": derived,
        "requiredMeanSourceHoursPerWallHour": derived / 24,
        "estimatedPreparationModelsPer30DaysUsd": daily_model * 30,
        "minimumFundedLimits": {"audioHoursPerDay": fresh, "dailyUsd": daily_model, "monthlyUsd": daily_model * 30},
        "initialLatestThreeUniqueHours": initial_hours,
        "coldStartDaysAudioFloorWithoutNewArrivals": preparation_days_floor,
        "sustainableUnderCurrentCapsBeforeQueries": sustained,
        "maximumSustainableDelay": "Not established by a steady-state benchmark" if sustained else "No finite bound: sustained demand exceeds current capacity",
        "existingAwsRunRateUsd": aws_base,
        "coreOperatingCostLowerBoundUsd": operating_floor,
        "minimumCoreRevenueUsdPerActiveUser": operating_floor / users,
        "minimumTranslatePayersIgnoringTranslateCosts": math.ceil(operating_floor / net_translate_usd),
        "minimumPayingFractionIgnoringTranslateCosts": math.ceil(operating_floor / net_translate_usd) / users,
    })

result = {
    "evidenceDate": measured["at"],
    "assumptions": {"daysPerMonth": 30, "followsPerUser": 5, "newEpisodesPerShowPerWeek": 1,
        "averageEpisodeHours": 1, "listeningHoursPerUserPerDay": 1,
        "completedCacheFraction": .6, "publisherTranscriptFraction": .2, "freshTranscriptionFraction": .2,
        "uniqueShowsAreScenarioInputsNotMeasured": True,
        "translatePriceGbp": 14.99, "illustrativeVatFraction": .20, "illustrativeStoreFeeFraction": .15,
        "illustrativeUsdPerGbp": 1.25,
        "pricingNote": "Planning assumptions, not verified tax, fee eligibility or current FX. Translate stays private; no billing enabled."},
    "measured": {"audioUsdPerHour": audio_rate, "meanTextUsdPerEpisode": measured["measuredAverageTextUsdPerEpisode"],
        "meanIndexUsdPerEpisode": measured["measuredAverageIndexUsdPerEpisode"],
        "meanReviewUsdPerEpisode": measured["measuredAverageReviewUsdPerEpisode"],
        "sampleResult": "Three PARTIAL_READY episodes, not three fully validated completions",
        "observedThroughput": measured["observedThroughput"],
        "globalCacheHitRate": None, "globalDuplicateSavingsUsd": None,
        "adAcousticCpuCostPerHourUsd": None, "fullFourHourCompletedCostUsd": None},
    "estimatedFourHourPreparationUsd": 14412 * .0001 + 4 * overhead,
    "estimatedFourHourAudioUsdIncludingOverlap": 14412 * .0001,
    "scenarios": scenarios,
    "excluded": ["query serving", "source overlap beyond the explicit four-hour estimate", "Translate generation/delivery",
        "incremental monitoring", "future infrastructure scaling", "support", "tax and FX uncertainty"],
    "warning": "Lower bounds, not funded configurations or public capacity guarantees. New incoming demand must fit BOTH monetary and audio caps. Partial outputs do not meet the 95% complete-quality gate.",
    "appliedConfigurationChanges": False,
}
(root / "evals/public-launch-economics.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"estimatedFourHourUsd": result["estimatedFourHourPreparationUsd"], "scenarios": scenarios}, indent=2))
