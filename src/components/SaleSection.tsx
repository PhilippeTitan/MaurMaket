import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';

const DISCOUNT_OPTIONS = [10, 15, 20, 25];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplayDate(day: number, month: number, year: number) {
  return `${MONTHS[month]} ${day}, ${year}`;
}

interface SaleSectionProps {
  originalPrice: string;
  salePrice: string;
  saleEndDate: string;
  onSalePriceChange: (price: string) => void;
  onSaleEndDateChange: (date: string) => void;
}

export default function SaleSection({
  originalPrice,
  salePrice,
  saleEndDate,
  onSalePriceChange,
  onSaleEndDateChange,
}: SaleSectionProps) {
  const origNum = parseFloat(originalPrice) || 0;
  const initPct = origNum > 0 && parseFloat(salePrice) > 0 && parseFloat(salePrice) < origNum
    ? Math.round((1 - parseFloat(salePrice) / origNum) * 100)
    : 15;
  const [mode, setMode] = useState<'pills' | 'slider'>('pills');
  const [sliderPct, setSliderPct] = useState(initPct);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Parse existing date or default to tomorrow
  const parsedDate = saleEndDate ? new Date(saleEndDate) : new Date(Date.now() + 86400000);
  const [pickerDay, setPickerDay] = useState(parsedDate.getDate());
  const [pickerMonth, setPickerMonth] = useState(parsedDate.getMonth());
  const [pickerYear, setPickerYear] = useState(parsedDate.getFullYear());

  const currentPct = origNum > 0 && parseFloat(salePrice) < origNum
    ? Math.round((1 - parseFloat(salePrice) / origNum) * 100)
    : 0;

  const saleNum = parseFloat(salePrice) || 0;
  const savings = origNum - saleNum;
  const isValid = origNum > 0 && saleNum > 0 && saleNum < origNum && currentPct <= 25;

  const applyDiscount = useCallback((pct: number) => {
    if (origNum <= 0) return;
    const newPrice = Math.round(origNum * (1 - pct / 100));
    onSalePriceChange(String(newPrice));
  }, [origNum, onSalePriceChange]);

  const handleSliderChange = (value: number) => {
    setSliderPct(value);
    applyDiscount(value);
  };

  const handleDateConfirm = () => {
    const daysInMonth = getDaysInMonth(pickerMonth, pickerYear);
    const clampedDay = Math.min(pickerDay, daysInMonth);
    const iso = new Date(pickerYear, pickerMonth, clampedDay).toISOString();
    onSaleEndDateChange(iso.split('T')[0]);
    setShowDatePicker(false);
  };

  const displayDate = saleEndDate
    ? formatDisplayDate(
        new Date(saleEndDate).getDate(),
        new Date(saleEndDate).getMonth(),
        new Date(saleEndDate).getFullYear()
      )
    : 'Tap to select';

  // Scroll data for date picker columns
  const dayData = Array.from({ length: 31 }, (_, i) => i + 1);
  const monthData = MONTHS.map((name, i) => ({ name, index: i }));
  const yearData = [pickerYear - 1, pickerYear, pickerYear + 1];

  return (
    <View style={styles.container}>
      {/* Sale Price Label */}
      <Text style={styles.label}>Sale Price</Text>

      {/* Pills / Slider Toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'pills' && styles.modeBtnActive]}
          onPress={() => setMode('pills')}
          accessibilityRole="button"
          accessibilityLabel="quick select discounts"
          accessibilityState={{ selected: mode === 'pills' }}
        >
          <MaterialCommunityIcons name="shape" size={14} color={mode === 'pills' ? COLORS.white : COLORS.text2} />
          <Text style={[styles.modeBtnText, mode === 'pills' && styles.modeBtnTextActive]}>Quick</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'slider' && styles.modeBtnActive]}
          onPress={() => setMode('slider')}
          accessibilityRole="button"
          accessibilityLabel="slider discount"
          accessibilityState={{ selected: mode === 'slider' }}
        >
          <MaterialCommunityIcons name="tune-variant" size={14} color={mode === 'slider' ? COLORS.white : COLORS.text2} />
          <Text style={[styles.modeBtnText, mode === 'slider' && styles.modeBtnTextActive]}>Slider</Text>
        </TouchableOpacity>
      </View>

      {/* Pills Mode */}
      {mode === 'pills' && (
        <View style={styles.pillsRow}>
          {DISCOUNT_OPTIONS.map(pct => (
            <TouchableOpacity
              key={pct}
              style={[styles.discountPill, currentPct === pct && !showCustomInput && styles.discountPillActive]}
              onPress={() => { setShowCustomInput(false); applyDiscount(pct); }}
              accessibilityRole="button"
              accessibilityLabel={`${pct} percent off`}
              accessibilityState={{ selected: currentPct === pct && !showCustomInput }}
            >
              <Text style={[styles.discountPillText, currentPct === pct && !showCustomInput && styles.discountPillTextActive]}>
                -{pct}%
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.discountPill, showCustomInput && styles.discountPillActive]}
            onPress={() => setShowCustomInput(!showCustomInput)}
            accessibilityRole="button"
            accessibilityLabel="custom discount"
            accessibilityState={{ selected: showCustomInput }}
          >
            <Text style={[styles.discountPillText, showCustomInput && styles.discountPillTextActive]}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Input (pills mode) */}
      {mode === 'pills' && showCustomInput && (
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>Enter sale price:</Text>
          <View style={styles.customInputWrap}>
            <Text style={styles.customPrefix}>Rs</Text>
            <View style={styles.customInput}>
              <TouchableOpacity onPress={() => {
                const v = Math.max(1, saleNum - 1);
                onSalePriceChange(String(v));
              }} style={styles.stepperBtn}>
                <MaterialCommunityIcons name="minus" size={16} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.customValue}>{salePrice || '0'}</Text>
              <TouchableOpacity onPress={() => {
                const v = Math.min(origNum - 1, saleNum + 1);
                onSalePriceChange(String(v));
              }} style={styles.stepperBtn}>
                <MaterialCommunityIcons name="plus" size={16} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Slider Mode */}
      {mode === 'slider' && (
        <View style={styles.sliderContainer}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${(sliderPct / 25) * 100}%` }]} />
            <TouchableOpacity
              style={[styles.sliderThumb, { left: `${(sliderPct / 25) * 100}%` }]}
              onPress={() => {}}
              accessibilityRole="adjustable"
              accessibilityLabel={`${sliderPct} percent off`}
            />
          </View>
          {/* Discrete steps */}
          <View style={styles.sliderSteps}>
            {[0, 5, 10, 15, 20, 25].map(pct => (
              <TouchableOpacity
                key={pct}
                style={styles.sliderStep}
                onPress={() => handleSliderChange(pct)}
              >
                <View style={[styles.sliderDot, sliderPct >= pct && styles.sliderDotActive]} />
                <Text style={[styles.sliderStepLabel, sliderPct === pct && styles.sliderStepLabelActive]}>
                  {pct}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Slider row of taps */}
          <View style={styles.sliderTapRow}>
            {Array.from({ length: 26 }, (_, i) => (
              <TouchableOpacity
                key={i}
                style={styles.sliderTapZone}
                onPress={() => handleSliderChange(i)}
                accessibilityRole="button"
                accessibilityLabel={`${i} percent off`}
              />
            ))}
          </View>
        </View>
      )}

      {/* Live preview */}
      {isValid && (
        <Text style={styles.hint}>
          Rs {formatPrice(saleNum)} · {currentPct}% off · Rs {formatPrice(savings)} saved
        </Text>
      )}

      {/* Sale End Date */}
      <Text style={[styles.label, { marginTop: 12 }]}>Sale Ends</Text>
      <TouchableOpacity
        style={styles.dateBtn}
        onPress={() => setShowDatePicker(true)}
        accessibilityRole="button"
        accessibilityLabel={`sale end date: ${displayDate}`}
      >
        <MaterialCommunityIcons name="calendar-clock" size={16} color={COLORS.coral} />
        <Text style={[styles.dateBtnText, !saleEndDate && styles.dateBtnPlaceholder]}>
          {displayDate}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.text2} />
      </TouchableOpacity>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select End Date</Text>

            <View style={styles.pickerRow}>
              {/* Day */}
              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>Day</Text>
                <FlatList
                  data={dayData}
                  keyExtractor={item => String(item)}
                  style={styles.pickerList}
                  showsVerticalScrollIndicator={false}
                  getItemLayout={(_, index) => ({ length: 40, offset: 40 * index, index })}
                  initialScrollIndex={Math.max(0, pickerDay - 2)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pickerItem, item === pickerDay && styles.pickerItemActive]}
                      onPress={() => setPickerDay(item)}
                    >
                      <Text style={[styles.pickerItemText, item === pickerDay && styles.pickerItemTextActive]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>

              {/* Month */}
              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>Month</Text>
                <FlatList
                  data={monthData}
                  keyExtractor={item => String(item.index)}
                  style={styles.pickerList}
                  showsVerticalScrollIndicator={false}
                  getItemLayout={(_, index) => ({ length: 40, offset: 40 * index, index })}
                  initialScrollIndex={Math.max(0, pickerMonth - 1)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pickerItem, item.index === pickerMonth && styles.pickerItemActive]}
                      onPress={() => setPickerMonth(item.index)}
                    >
                      <Text style={[styles.pickerItemText, item.index === pickerMonth && styles.pickerItemTextActive]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>

              {/* Year */}
              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>Year</Text>
                <FlatList
                  data={yearData}
                  keyExtractor={item => String(item)}
                  style={styles.pickerList}
                  showsVerticalScrollIndicator={false}
                  getItemLayout={(_, index) => ({ length: 40, offset: 40 * index, index })}
                  initialScrollIndex={1}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pickerItem, item === pickerYear && styles.pickerItemActive]}
                      onPress={() => setPickerYear(item)}
                    >
                      <Text style={[styles.pickerItemText, item === pickerYear && styles.pickerItemTextActive]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleDateConfirm}>
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md,
    marginBottom: 8,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.row,
  },
  label: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  // Mode toggle
  modeRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.pill,
    padding: 2,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  modeBtnActive: {
    backgroundColor: COLORS.coral,
  },
  modeBtnText: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: COLORS.white,
  },

  // Pills
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  discountPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  discountPillActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  discountPillText: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: '600',
  },
  discountPillTextActive: {
    color: COLORS.white,
  },

  // Custom input
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  customLabel: {
    fontSize: 12,
    color: COLORS.text2,
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customPrefix: {
    fontSize: 13,
    color: COLORS.text2,
    fontWeight: '600',
  },
  customInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  customValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center',
  },

  // Slider
  sliderContainer: {
    marginBottom: 8,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: COLORS.surface2,
    borderRadius: 3,
    position: 'relative',
    marginHorizontal: 4,
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: COLORS.coral,
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.coral,
    borderWidth: 2,
    borderColor: COLORS.white,
    marginLeft: -11,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sliderSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 6,
  },
  sliderStep: {
    alignItems: 'center',
    width: 30,
  },
  sliderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginBottom: 3,
  },
  sliderDotActive: {
    backgroundColor: COLORS.coral,
  },
  sliderStepLabel: {
    fontSize: 10,
    color: COLORS.text2,
  },
  sliderStepLabelActive: {
    color: COLORS.coral,
    fontWeight: '700',
  },
  sliderTapRow: {
    flexDirection: 'row',
    position: 'absolute',
    top: -12,
    left: 0,
    right: 0,
    height: 30,
  },
  sliderTapZone: {
    flex: 1,
    height: '100%',
  },

  // Hint
  hint: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginTop: 4,
  },

  // Date button
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.row,
    padding: 12,
  },
  dateBtnText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
  dateBtnPlaceholder: {
    color: COLORS.text2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  pickerCol: {
    flex: 1,
    alignItems: 'center',
  },
  pickerColLabel: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 160,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: COLORS.coral,
  },
  pickerItemText: {
    fontSize: 14,
    color: COLORS.text2,
    fontWeight: '500',
  },
  pickerItemTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    color: COLORS.text2,
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '700',
  },
});
