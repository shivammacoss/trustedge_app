import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const DOC_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'id_front', label: 'ID Card (Front)' },
  { value: 'id_back', label: 'ID Card (Back)' },
  { value: 'selfie', label: 'Selfie with ID' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'other', label: 'Other' },
];

const MAX_BYTES = 10 * 1024 * 1024;

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'verified' || v === 'approved') return 'approved';
  if (v === 'submitted' || v === 'under_review' || v === 'pending') return 'review';
  if (v === 'rejected' || v === 'failed') return 'rejected';
  return 'none';
}

async function authHeaders() {
  const token = await SecureStore.getItemAsync('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function KycScreen({ navigation }) {
  const { colors } = useTheme();
  const accent = colors.primary;
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [docType, setDocType] = useState('passport');
  const [file, setFile] = useState(null);
  const [docType2, setDocType2] = useState('');
  const [file2, setFile2] = useState(null);

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [pickerSlot, setPickerSlot] = useState(null); // 'one' | 'two' | null
  const [typePickerOpen, setTypePickerOpen] = useState(null); // 'one' | 'two' | null

  const fetchProfile = useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/profile`, { headers: { 'Content-Type': 'application/json', ...h } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProfile(data);
        setAddress(data.address || '');
        setCity(data.city || '');
        setPostal(data.postal_code || '');
        setCountry(data.country || data.country_of_residence || '');
      }
    } catch (e) {
      console.warn('KYC profile fetch:', e.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchProfile();
      setLoading(false);
    })();
  }, [fetchProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  };

  const requestCameraPerm = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return false;
    }
    return true;
  };

  const requestGalleryPerm = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery access is required to pick images.');
      return false;
    }
    return true;
  };

  const fileFromAsset = (asset) => {
    if (!asset) return null;
    const uri = asset.uri;
    const name = asset.fileName || uri.split('/').pop() || `kyc-${Date.now()}.jpg`;
    const ext = (name.split('.').pop() || 'jpg').toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'pdf' ? 'application/pdf' :
      'image/jpeg';
    const size = asset.fileSize || 0;
    if (size > MAX_BYTES) {
      Alert.alert('File too large', 'Max 10 MB allowed.');
      return null;
    }
    return { uri, name, type: mime, size };
  };

  const pickFromCamera = async (slot) => {
    if (!(await requestCameraPerm())) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const f = fileFromAsset(result.assets?.[0]);
    if (!f) return;
    if (slot === 'one') setFile(f);
    else setFile2(f);
    setPickerSlot(null);
  };

  const pickFromGallery = async (slot) => {
    if (!(await requestGalleryPerm())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const f = fileFromAsset(result.assets?.[0]);
    if (!f) return;
    if (slot === 'one') setFile(f);
    else setFile2(f);
    setPickerSlot(null);
  };

  const submit = async () => {
    if (!docType) {
      Alert.alert('Document type', 'Please select a document type.');
      return;
    }
    if (!file) {
      Alert.alert('Document file', 'Please attach the primary document.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('document_type', docType);
      fd.append('file', { uri: file.uri, name: file.name, type: file.type });
      if (docType2 && file2) {
        fd.append('document_type_2', docType2);
        fd.append('file_2', { uri: file2.uri, name: file2.name, type: file2.type });
      }
      if (address) fd.append('residential_address', address);
      if (city) fd.append('city', city);
      if (postal) fd.append('postal_code', postal);
      if (country) fd.append('country_of_residence', country);

      const h = await authHeaders();
      const res = await fetch(`${API_URL}/profile/kyc/submit/`, {
        method: 'POST',
        headers: { ...h },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = Array.isArray(data?.detail)
          ? data.detail.map((e) => e.msg || e.message || JSON.stringify(e)).join('\n')
          : data?.detail || data?.message || `Error ${res.status}`;
        Alert.alert('Submission failed', err);
      } else {
        Alert.alert('Submitted', 'Your documents are under review.');
        setFile(null);
        setFile2(null);
        setDocType2('');
        await fetchProfile();
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Network error');
    }
    setSubmitting(false);
  };

  const status = normalizeStatus(profile?.kyc_status);
  const docs = Array.isArray(profile?.kyc_documents) ? profile.kyc_documents : [];

  const statusColor =
    status === 'approved' ? colors.success :
    status === 'review' ? colors.warning :
    status === 'rejected' ? colors.error :
    colors.textMuted;

  const statusLabel =
    status === 'approved' ? 'Approved' :
    status === 'review' ? 'Under Review' :
    status === 'rejected' ? 'Rejected' :
    'Not Submitted';

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  const canSubmit = status !== 'review' && status !== 'approved';

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>KYC Verification</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Status card */}
        <View
          style={[
            styles.statusCard,
            { backgroundColor: colors.bgCard, borderColor: statusColor, borderLeftWidth: 4 },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: statusColor + '20' }]}>
              <Ionicons
                name={
                  status === 'approved' ? 'shield-checkmark' :
                  status === 'review' ? 'time' :
                  status === 'rejected' ? 'close-circle' :
                  'shield-outline'
                }
                size={26}
                color={statusColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Identity Verification</Text>
              <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          {status === 'review' && (
            <Text style={[styles.helperTxt, { color: colors.textSecondary }]}>
              Your documents are being reviewed. Typically takes 24–48 hours.
            </Text>
          )}
          {status === 'rejected' && (
            <Text style={[styles.helperTxt, { color: colors.error }]}>
              Your previous submission was rejected. Please re-submit with valid documents.
            </Text>
          )}
          {status === 'approved' && (
            <Text style={[styles.helperTxt, { color: colors.textSecondary }]}>
              Your identity has been verified. All features are unlocked.
            </Text>
          )}

          {docs.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.docsHead, { color: colors.textMuted }]}>Submitted Documents</Text>
              {docs.map((d, i) => {
                const dStatus = String(d.status || '').toLowerCase();
                const dColor =
                  dStatus === 'approved' || dStatus === 'verified' ? colors.success :
                  dStatus === 'rejected' || dStatus === 'failed' ? colors.error :
                  colors.warning;
                return (
                  <View
                    key={d.id || i}
                    style={[styles.docRow, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docName, { color: colors.textPrimary }]}>
                        {(d.document_type || 'Document').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Text>
                      {d.rejection_reason ? (
                        <Text style={[styles.docReason, { color: colors.error }]}>{d.rejection_reason}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.docPill, { backgroundColor: dColor + '20' }]}>
                      <Text style={[styles.docPillTxt, { color: dColor }]}>
                        {d.status?.charAt(0).toUpperCase() + (d.status || '').slice(1)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {!canSubmit ? null : (
          <View style={[styles.formCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Submit your documents</Text>
            <Text style={[styles.formHint, { color: colors.textMuted }]}>
              Upload a clear photo (JPG, PNG, max 10 MB). You can attach a second document if required.
            </Text>

            {/* Primary document */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Document type</Text>
            <TouchableOpacity
              style={[styles.selectBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
              onPress={() => setTypePickerOpen('one')}
            >
              <Text style={{ color: colors.textPrimary }}>
                {DOC_TYPES.find((d) => d.value === docType)?.label || 'Select…'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Document file</Text>
            {file ? (
              <View style={[styles.fileBox, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                {file.type?.startsWith('image/') ? (
                  <Image source={{ uri: file.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }]}>
                    <Ionicons name="document" size={24} color={accent} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 13 }}>{file.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {file.size ? `${(file.size / 1024).toFixed(0)} KB` : 'Image'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setFile(null)} style={styles.iconBtn}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                onPress={() => setPickerSlot('one')}
              >
                <Ionicons name="cloud-upload-outline" size={22} color={accent} />
                <Text style={{ color: accent, fontWeight: '600', marginTop: 6 }}>Add document</Text>
              </TouchableOpacity>
            )}

            {/* Secondary document */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 18 }]}>
              Second document (optional)
            </Text>
            <TouchableOpacity
              style={[styles.selectBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
              onPress={() => setTypePickerOpen('two')}
            >
              <Text style={{ color: docType2 ? colors.textPrimary : colors.textMuted }}>
                {docType2 ? DOC_TYPES.find((d) => d.value === docType2)?.label : 'Not selected'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {file2 ? (
              <View style={[styles.fileBox, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                <Image source={{ uri: file2.uri }} style={styles.thumb} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 13 }}>{file2.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {file2.size ? `${(file2.size / 1024).toFixed(0)} KB` : 'Image'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setFile2(null)} style={styles.iconBtn}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                onPress={() => setPickerSlot('two')}
                disabled={!docType2}
              >
                <Ionicons name="cloud-upload-outline" size={22} color={docType2 ? accent : colors.textMuted} />
                <Text style={{ color: docType2 ? accent : colors.textMuted, fontWeight: '600', marginTop: 6 }}>
                  {docType2 ? 'Add second document' : 'Pick a type first'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Address */}
            <Text style={[styles.sectionHead, { color: colors.textPrimary }]}>Residential Address (optional)</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address"
              placeholderTextColor={colors.textMuted}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>City</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Postal code</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                  value={postal}
                  onChangeText={setPostal}
                  placeholder="ZIP"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Country</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
              value={country}
              onChangeText={setCountry}
              placeholder="Country of residence"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: accent }, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitTxt}>Submit for review</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Source picker action sheet */}
      <Modal visible={!!pickerSlot} transparent animationType="fade" onRequestClose={() => setPickerSlot(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPickerSlot(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add document</Text>
            <TouchableOpacity
              style={[styles.sheetItem, { borderTopColor: colors.border }]}
              onPress={() => pickFromCamera(pickerSlot)}
            >
              <Ionicons name="camera-outline" size={20} color={accent} />
              <Text style={[styles.sheetTxt, { color: colors.textPrimary }]}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetItem, { borderTopColor: colors.border }]}
              onPress={() => pickFromGallery(pickerSlot)}
            >
              <Ionicons name="image-outline" size={20} color={accent} />
              <Text style={[styles.sheetTxt, { color: colors.textPrimary }]}>Choose from gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetItem, { borderTopColor: colors.border }]}
              onPress={() => setPickerSlot(null)}
            >
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.sheetTxt, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Document type picker */}
      <Modal visible={!!typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setTypePickerOpen(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.bgCard, maxHeight: '70%' }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Select document type</Text>
            <ScrollView>
              {DOC_TYPES.map((d) => {
                const selected = typePickerOpen === 'one' ? docType === d.value : docType2 === d.value;
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.sheetItem, { borderTopColor: colors.border }]}
                    onPress={() => {
                      if (typePickerOpen === 'one') setDocType(d.value);
                      else setDocType2(d.value);
                      setTypePickerOpen(null);
                    }}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? accent : colors.textMuted}
                    />
                    <Text style={[styles.sheetTxt, { color: colors.textPrimary }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  backHit: { padding: 8, width: 44 },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },

  statusCard: { marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  helperTxt: { fontSize: 12, lineHeight: 17, marginTop: 12 },

  docsHead: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  docName: { fontSize: 13, fontWeight: '600' },
  docReason: { fontSize: 11, marginTop: 2 },
  docPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  docPillTxt: { fontSize: 11, fontWeight: '700' },

  formCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  formTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  formHint: { fontSize: 12, marginBottom: 16 },
  label: { fontSize: 12, marginBottom: 6, marginTop: 12 },
  sectionHead: { fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 4 },

  selectBtn: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  uploadBtn: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 22,
    alignItems: 'center', marginTop: 6,
  },
  fileBox: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10,
    padding: 10, marginTop: 6,
  },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  iconBtn: { padding: 6 },

  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, minHeight: 44,
  },

  submitBtn: { marginTop: 22, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 18, paddingBottom: 30, paddingHorizontal: 18 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetTxt: { fontSize: 15 },
});
