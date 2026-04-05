import { create } from 'zustand';
import type { IndicatorRating } from '../types';

interface RatingsState {
  ratings: Record<string, IndicatorRating>;
  setRating: (indicatorId: string, rating: IndicatorRating) => void;
  setRatings: (ratings: IndicatorRating[]) => void;
  getRating: (indicatorId: string) => IndicatorRating | undefined;
}

export const useRatingsStore = create<RatingsState>((set, get) => ({
  ratings: {},
  setRating: (indicatorId, rating) =>
    set((state) => ({ ratings: { ...state.ratings, [indicatorId]: rating } })),
  setRatings: (ratings) =>
    set({
      ratings: ratings.reduce(
        (acc, r) => ({ ...acc, [r.indicator_id]: r }),
        {} as Record<string, IndicatorRating>
      ),
    }),
  getRating: (indicatorId) => get().ratings[indicatorId],
}));
