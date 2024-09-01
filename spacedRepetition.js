// Spaced Repetition Algorithm Module

// SM-2 algorithm parameters
const DEFAULT_EASINESS_FACTOR = 2.5;
const DEFAULT_INTERVAL_STEPS = [1, 6];

export class SpacedRepetitionItem {
  constructor(id, question, answer, easinessFactor = DEFAULT_EASINESS_FACTOR, interval = 0, repetitions = 0) {
    this.id = id;
    this.question = question;
    this.answer = answer;
    this.easinessFactor = easinessFactor;
    this.interval = interval;
    this.repetitions = repetitions;
    this.nextReviewDate = new Date();
  }

  updateReview(quality, settings) {
    const { minimumEasinessFactor, intervalModifier } = settings;
    
    if (quality >= 3) {
      if (this.repetitions === 0) {
        this.interval = 1;
      } else if (this.repetitions === 1) {
        this.interval = 6;
      } else {
        this.interval = Math.round(this.interval * this.easinessFactor);
      }
      this.repetitions += 1;
    } else {
      this.repetitions = 0;
      this.interval = 1;
    }

    this.easinessFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    this.easinessFactor = Math.max(this.easinessFactor, minimumEasinessFactor);

    const now = new Date();
    this.nextReviewDate = new Date(now.getTime() + this.interval * intervalModifier * 24 * 60 * 60 * 1000);
  }
}

export function initializeSpacedRepetition(items, settings) {
  return items.map(item => new SpacedRepetitionItem(
    item.id,
    item.question,
    item.answer,
    item.easinessFactor,
    item.interval,
    item.repetitions
  ));
}

export function getNextReviewItem(items, currentDate = new Date()) {
  return items.find(item => item.nextReviewDate <= currentDate);
}

export function updateItemReview(item, quality, settings) {
  item.updateReview(quality, settings);
  return item;
}