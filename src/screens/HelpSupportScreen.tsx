import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Animated, Linking, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_KEYS = ['buy', 'sell', 'moncash', 'meetup', 'return'] as const;
type FAQKey = typeof FAQ_KEYS[number];
interface FAQItem {
  question: string;
  answer: string;
}
const getFaqs = (t: (k: string) => string): FAQItem[] =>
  FAQ_KEYS.map((k: FAQKey) => ({ question: t(`faq.${k}Q`), answer: t(`faq.${k}A`) }));

export default function HelpSupportScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  // A meetup safety concern arrives here because this is the live private
  // channel. No case is filed from the app: the report is an allegation until
  // Support reviews it, and nothing about the order changes either way.
  const safetyTopic = route.params?.topic === 'safety';
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const FAQS = getFaqs(t);

  // Staggered entrance
  const sections = useRef(
    Array.from({ length: 4 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(16),
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(60,
      sections.map(s =>
        Animated.parallel([
          Animated.timing(s.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(s.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  const animStyle = (i: number) => ({
    opacity: sections[i].opacity,
    transform: [{ translateY: sections[i].translateY }],
  });

  const filteredFAQs = FAQS.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContactUs = () => {
    const email = 'support@maurmaket.com';
    const subject = encodeURIComponent(safetyTopic ? 'MaurMaket — private meetup safety report' : 'MaurMaket Support Request');
    const opening = safetyTopic
      ? 'I want to report a safety concern about a meetup.\n\nWhat happened (please include the area and, if you can, the date):\n\n[Describe what you saw or experienced]\n\nAnything that corroborates it (photos, messages, another person present):\n\n[Optional]'
      : 'I need help with:\n\n[Describe your issue]';
    const body = encodeURIComponent(`Hi MaurMaket team,\n\n${opening}\n\nDevice: ${Platform.OS} ${Platform.Version}\nApp version: 1.0.0`);
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  const handleReportProblem = () => {
    const email = 'bugs@maurmaket.com';
    const subject = encodeURIComponent('Bug Report — MaurMaket');
    const body = encodeURIComponent(`What happened:\n\nSteps to reproduce:\n\nExpected behavior:\n\nDevice: ${Platform.OS} ${Platform.Version}\nApp version: 1.0.0`);
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('help.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {safetyTopic && (
          <View style={styles.safetyBanner} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="shield-alert-outline" size={18} color={COLORS.text2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.safetyTitle}>{t('meetupSafety.helpTitle')}</Text>
              <Text style={styles.safetyBody}>{t('meetupSafety.reportPrivate')}</Text>
            </View>
          </View>
        )}

        {/* Search Bar */}
        <Animated.View style={animStyle(0)}>
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text3} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('help.searchPlaceholder')}
              placeholderTextColor={COLORS.text3}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.text3} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* FAQs */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup header={t('help.faqHeader')}>
            {filteredFAQs.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="file-search-outline" size={32} color={COLORS.text3} />
                <Text style={styles.emptyText}>{t('help.noResults')}</Text>
              </View>
            ) : (
              filteredFAQs.map((faq, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.6}
                  onPress={() => setExpandedFAQ(expandedFAQ === i ? null : i)}
                  style={styles.faqItem}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion} numberOfLines={2}>{faq.question}</Text>
                    <MaterialCommunityIcons
                      name={expandedFAQ === i ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.text3}
                    />
                  </View>
                  {expandedFAQ === i && (
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  )}
                  {i < filteredFAQs.length - 1 && <View style={styles.divider} />}
                </TouchableOpacity>
              ))
            )}
          </SettingsGroup>
        </Animated.View>

        {/* Contact Options */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup header={t('help.contactUs')}>
            <TouchableOpacity style={styles.contactRow} activeOpacity={0.6} onPress={handleContactUs}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="email-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactLabel}>{t('help.emailSupport')}</Text>
                <Text style={styles.contactSubtitle}>support@maurmaket.com</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.dividerFull} />
            <TouchableOpacity style={styles.contactRow} activeOpacity={0.6} onPress={handleReportProblem}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="bug-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactLabel}>{t('help.reportProblem')}</Text>
                <Text style={styles.contactSubtitle}>{t('help.reportSubtitle')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.dividerFull} />
            <TouchableOpacity
              style={styles.contactRow}
              activeOpacity={0.6}
              onPress={() => Linking.openURL('https://maurmaket.com/terms')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactLabel}>{t('help.terms')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.dividerFull} />
            <TouchableOpacity
              style={styles.contactRow}
              activeOpacity={0.6}
              onPress={() => Linking.openURL('https://maurmaket.com/privacy')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="shield-lock-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactLabel}>{t('help.privacy')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  // Private-report path (Batch 82/83): explains how a report is handled before
  // the shopper writes one, so no outcome is implied.
  safetyBanner: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: SPACING.md, marginHorizontal: SPACING.md, marginTop: SPACING.md,
  },
  safetyTitle: { color: COLORS.text, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 3 },
  safetyBody: { color: COLORS.text2, fontSize: 12, lineHeight: 17 },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    color: COLORS.text,
    padding: 0,
  },

  // FAQ
  faqItem: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  faqQuestion: { flex: 1, fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  faqAnswer: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text2,
    marginTop: SPACING.sm,
    lineHeight: 20,
  },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  emptyText: { fontSize: FONT_SIZES.sm, color: COLORS.text3 },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },
  iconContainer: {
    width: 28,
    height: 32,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: { flex: 1 },
  contactLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  contactSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },

  // Dividers
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: SPACING.md },
  dividerFull: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: SPACING.sm + 28 + SPACING.md },

  bottomSpacer: { height: 60 },
});
