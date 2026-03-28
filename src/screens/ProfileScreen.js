import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, API_BASE_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const ProfileScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [editData, setEditData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    country: '',
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  // Fetch profile from PTD2 backend
  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        setLoading(false);
        return;
      }
      
      const res = await fetch(`${API_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('[Profile] Fetched profile:', data);
      
      if (res.ok && data) {
        setUser(data);
        setEditData({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone: data.phone || '',
          country: data.country || '',
        });
        // Update SecureStore with latest profile data
        const storedUser = await SecureStore.getItemAsync('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const updated = { ...parsed, ...data };
          await SecureStore.setItemAsync('user', JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
    setLoading(false);
  };

  const showImageOptions = () => {
    Alert.alert(
      'Update Profile Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takeProfilePhoto },
        { text: 'Choose from Gallery', onPress: pickProfileImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const pickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      uploadProfileImage(result.assets[0].uri);
    }
  };

  const takeProfilePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      uploadProfileImage(result.assets[0].uri);
    }
  };

  const uploadProfileImage = async (imageUri) => {
    setUploadingImage(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      });

      const res = await fetch(`${API_URL}/profile/upload-document`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      
      if (res.ok) {
        setProfileImage(imageUri);
        Alert.alert('Success', 'Profile image updated');
      } else {
        // If upload endpoint doesn't exist, just show locally
        setProfileImage(imageUri);
        Alert.alert('Info', 'Image set locally');
      }
    } catch (e) {
      console.error('Upload error:', e);
      // Set locally even if server upload fails
      setProfileImage(imageUri);
    }
    setUploadingImage(false);
  };

  // Update profile via PTD2 backend
  const handleUpdateProfile = async () => {
    if (!editData.first_name) {
      Alert.alert('Error', 'First name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editData)
      });
      const data = await res.json();
      console.log('[Profile] Update response:', data);
      
      if (res.ok) {
        // Update local state with returned data
        setUser(prev => ({ ...prev, ...data }));
        // Update SecureStore
        const storedUser = await SecureStore.getItemAsync('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const updated = { ...parsed, ...data };
          await SecureStore.setItemAsync('user', JSON.stringify(updated));
        }
        Alert.alert('Success', 'Profile updated successfully');
        setShowEditModal(false);
      } else {
        Alert.alert('Error', data.detail || 'Failed to update profile');
      }
    } catch (e) {
      console.error('Update profile error:', e);
      Alert.alert('Error', 'Failed to update profile');
    }
    setIsSubmitting(false);
  };

  // Change password via PTD2 backend
  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/profile/password`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
        })
      });
      const data = await res.json();
      console.log('[Profile] Password change response:', data);
      
      if (res.ok) {
        Alert.alert('Success', data.message || 'Password changed successfully');
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        Alert.alert('Error', data.detail || 'Failed to change password');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to change password');
    }
    setIsSubmitting(false);
  };

  const getKycStatusColor = () => {
    const status = user?.kyc_status;
    switch (status) {
      case 'verified': case 'approved': return '#22c55e';
      case 'pending': return '#eab308';
      case 'rejected': return '#ef4444';
      default: return '#ef4444';
    }
  };

  const getKycStatusText = () => {
    const status = user?.kyc_status;
    switch (status) {
      case 'verified': case 'approved': return 'Verified';
      case 'pending': return 'Pending Review';
      case 'rejected': return 'Rejected';
      default: return 'Not Submitted';
    }
  };

  const getKycStatusIcon = () => {
    const status = user?.kyc_status;
    switch (status) {
      case 'verified': case 'approved': return 'shield-checkmark';
      case 'pending': return 'time';
      default: return 'shield-outline';
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.bgCard }]}>
          <TouchableOpacity style={styles.avatarContainer} onPress={showImageOptions} disabled={uploadingImage}>
            {profileImage ? (
              <Image 
                source={{ uri: profileImage }} 
                style={styles.avatarImage}
                onError={() => setProfileImage(null)}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={styles.avatarText}>
                  {(user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                  {(user?.last_name?.[0] || '').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.avatarEditBtn, { backgroundColor: colors.accent }]}>
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>
            {user?.first_name || ''} {user?.last_name || ''}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textMuted }]}>{user?.email}</Text>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Personal Information</Text>
          
          <View style={[styles.infoItem, { backgroundColor: colors.bgCard }]}>
            <View style={styles.infoLeft}>
              <Ionicons name="person-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Full Name</Text>
            </View>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {user?.first_name || ''} {user?.last_name || ''}
            </Text>
          </View>
          
          <View style={[styles.infoItem, { backgroundColor: colors.bgCard }]}>
            <View style={styles.infoLeft}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Email</Text>
            </View>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.email}</Text>
          </View>
          
          <View style={[styles.infoItem, { backgroundColor: colors.bgCard }]}>
            <View style={styles.infoLeft}>
              <Ionicons name="call-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Phone</Text>
            </View>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.phone || 'Not set'}</Text>
          </View>

          <View style={[styles.infoItem, { backgroundColor: colors.bgCard }]}>
            <View style={styles.infoLeft}>
              <Ionicons name="globe-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Country</Text>
            </View>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.country || 'Not set'}</Text>
          </View>

          <View style={[styles.infoItem, { backgroundColor: colors.bgCard }]}>
            <View style={styles.infoLeft}>
              <Ionicons name="shield-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Status</Text>
            </View>
            <Text style={[styles.infoValue, { color: user?.status === 'active' ? '#22c55e' : colors.textPrimary }]}>
              {(user?.status || 'active').charAt(0).toUpperCase() + (user?.status || 'active').slice(1)}
            </Text>
          </View>
        </View>

        {/* KYC Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>KYC Verification</Text>
            <View style={[styles.mandatoryBadge, { backgroundColor: '#ef444420' }]}>
              <Text style={styles.mandatoryText}>Mandatory</Text>
            </View>
          </View>
          
          <View style={[styles.kycCard, { backgroundColor: colors.bgCard, borderColor: getKycStatusColor() }]}>
            <View style={styles.kycHeader}>
              <View style={[styles.kycIconContainer, { backgroundColor: `${getKycStatusColor()}20` }]}>
                <Ionicons name={getKycStatusIcon()} size={28} color={getKycStatusColor()} />
              </View>
              <View style={styles.kycInfo}>
                <Text style={[styles.kycTitle, { color: colors.textPrimary }]}>Identity Verification</Text>
                <View style={styles.kycStatusRow}>
                  <View style={[styles.kycStatusDot, { backgroundColor: getKycStatusColor() }]} />
                  <Text style={[styles.kycStatusText, { color: getKycStatusColor() }]}>{getKycStatusText()}</Text>
                </View>
              </View>
            </View>

            {/* KYC Documents List */}
            {user?.kyc_documents?.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {user.kyc_documents.map((doc, i) => (
                  <View key={doc.id || i} style={[styles.kycDocItem, { borderTopColor: colors.border }]}>
                    <Text style={[styles.kycDocType, { color: colors.textPrimary }]}>
                      {(doc.document_type || 'Document').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                    <Text style={[styles.kycDocStatus, { 
                      color: doc.status === 'approved' ? '#22c55e' : doc.status === 'pending' ? '#eab308' : '#ef4444' 
                    }]}>
                      {doc.status?.charAt(0).toUpperCase() + doc.status?.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            
            {(!user?.kyc_status || user?.kyc_status === 'not_submitted') && (
              <View style={[styles.kycWarning, { backgroundColor: '#ef444410' }]}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={styles.kycWarningText}>Complete KYC to access all features including withdrawals</Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account Settings</Text>
          
          <TouchableOpacity style={[styles.actionItem, { backgroundColor: colors.bgCard }]} onPress={() => {
            setEditData({
              first_name: user?.first_name || '',
              last_name: user?.last_name || '',
              phone: user?.phone || '',
              country: user?.country || '',
            });
            setShowEditModal(true);
          }}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIcon, { backgroundColor: '#2563EB20' }]}>
                <Ionicons name="create-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.actionItem, { backgroundColor: colors.bgCard }]} onPress={() => setShowPasswordModal(true)}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIcon, { backgroundColor: '#2563EB20' }]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>First Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={editData.first_name}
              onChangeText={(text) => setEditData({ ...editData, first_name: text })}
              placeholder="Enter first name"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Last Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={editData.last_name}
              onChangeText={(text) => setEditData({ ...editData, last_name: text })}
              placeholder="Enter last name"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Phone</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={editData.phone}
              onChangeText={(text) => setEditData({ ...editData, phone: text })}
              placeholder="Enter phone number"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Country</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={editData.country}
              onChangeText={(text) => setEditData({ ...editData, country: text })}
              placeholder="Enter country"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleUpdateProfile}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Current Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={passwordData.currentPassword}
              onChangeText={(text) => setPasswordData({ ...passwordData, currentPassword: text })}
              placeholder="Enter current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>New Password (min 8 chars)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={passwordData.newPassword}
              onChangeText={(text) => setPasswordData({ ...passwordData, newPassword: text })}
              placeholder="Enter new password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Confirm New Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary }]}
              value={passwordData.confirmPassword}
              onChangeText={(text) => setPasswordData({ ...passwordData, confirmPassword: text })}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleChangePassword}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Change Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  
  profileCard: { alignItems: 'center', padding: 24, marginHorizontal: 16, borderRadius: 16, marginBottom: 16 },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  avatarEditBtn: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#000' },
  userName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  userEmail: { fontSize: 14 },
  
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  
  infoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500', maxWidth: '50%', textAlign: 'right' },
  
  mandatoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  mandatoryText: { color: '#ef4444', fontSize: 11, fontWeight: '600' },
  
  kycCard: { borderRadius: 16, padding: 16, borderWidth: 1.5 },
  kycHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kycIconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  kycInfo: { flex: 1 },
  kycTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  kycStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kycStatusDot: { width: 8, height: 8, borderRadius: 4 },
  kycStatusText: { fontSize: 13, fontWeight: '500' },
  kycDocItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 6, borderTopWidth: 1 },
  kycDocType: { fontSize: 13, fontWeight: '500' },
  kycDocStatus: { fontSize: 12, fontWeight: '600' },
  kycWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginTop: 12 },
  kycWarningText: { color: '#ef4444', fontSize: 12, flex: 1 },
  
  actionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 15, fontWeight: '500' },
  
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  
  inputLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: { borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 16 },
  
  submitBtn: { backgroundColor: '#2563EB', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default ProfileScreen;
