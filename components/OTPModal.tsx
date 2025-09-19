import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import { 
  Shield,
  X,
  Check,
  Copy
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface OTPModalProps {
  visible: boolean;
  type: 'pickup' | 'drop' | 'verify-pickup';
  currentOTP?: string;
  onVerify: (otp: string) => void;
  onClose: () => void;
}

export default function OTPModal({
  visible,
  type,
  currentOTP,
  onVerify,
  onClose,
}: OTPModalProps) {
  const [enteredOTP, setEnteredOTP] = useState('');

  const getModalTitle = () => {
    switch (type) {
      case 'pickup': return '✅ Pickup OTP Sent to Customer';
      case 'drop': return '🎉 Drop OTP Generated';
      case 'verify-pickup': return '🔍 Verify Pickup OTP';
      default: return 'OTP';
    }
  };

  const getModalMessage = () => {
    switch (type) {
      case 'pickup': 
        return 'A 4-digit OTP has been sent to the customer via SMS. Ask the customer to share the OTP with you to start the trip.';
      case 'drop': 
        return 'Customer will use this OTP to confirm successful drop-off.';
      case 'verify-pickup': 
        return 'Enter the OTP that the customer received to start the trip.';
      default: return '';
    }
  };

  const handleCopyOTP = () => {
    if (currentOTP) {
      // For web
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(currentOTP);
      }
      // For mobile, you'd use Clipboard from react-native-clipboard
    }
  };

  const handleVerify = () => {
    if (enteredOTP.trim().length === 4) {
      onVerify(enteredOTP.trim());
      setEnteredOTP('');
    }
  };

  const handleClose = () => {
    setEnteredOTP('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Shield size={24} color="#10B981" />
              <Text style={styles.title}>{getModalTitle()}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.message}>{getModalMessage()}</Text>

            {/* Show OTP only for drop (pickup OTP is hidden from driver) */}
            {type === 'drop' && currentOTP && (
              <View style={styles.otpDisplay}>
                <Text style={styles.otpLabel}>Drop OTP Code:</Text>
                <View style={styles.otpContainer}>
                  <Text style={styles.otpText}>{currentOTP}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={handleCopyOTP}>
                    <Copy size={20} color="#2563EB" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Show instruction for pickup OTP */}
            {type === 'pickup' && (
              <View style={styles.instructionContainer}>
                <View style={styles.instructionItem}>
                  <Text style={styles.instructionNumber}>1</Text>
                  <Text style={styles.instructionText}>OTP has been sent to customer's phone</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Text style={styles.instructionNumber}>2</Text>
                  <Text style={styles.instructionText}>Ask customer to share the 4-digit OTP</Text>
                </View>
                <View style={styles.instructionItem}>
                  <Text style={styles.instructionNumber}>3</Text>
                  <Text style={styles.instructionText}>Enter the OTP to start the trip</Text>
                </View>
              </View>
            )}

            {/* Enter OTP (for verification) */}
            {type === 'verify-pickup' && (
              <View style={styles.otpInput}>
                <Text style={styles.inputLabel}>Enter OTP:</Text>
                <TextInput
                  style={styles.textInput}
                  value={enteredOTP}
                  onChangeText={setEnteredOTP}
                  placeholder="Enter 4-digit OTP"
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus={true}
                />
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {type === 'verify-pickup' ? (
              <>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.verifyButton, 
                    enteredOTP.length !== 4 && styles.verifyButtonDisabled
                  ]} 
                  onPress={handleVerify}
                  disabled={enteredOTP.length !== 4}
                >
                  <Check size={20} color="#FFFFFF" />
                  <Text style={styles.verifyButtonText}>Verify OTP</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.okButton} onPress={handleClose}>
                <Text style={styles.okButtonText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: Math.min(width - 40, 400),
    maxWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginLeft: 8,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    marginBottom: 24,
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 20,
  },
  otpDisplay: {
    alignItems: 'center',
  },
  otpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  otpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  otpText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 8,
    marginRight: 16,
  },
  copyButton: {
    padding: 8,
  },
  otpInput: {
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    width: 150,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  verifyButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  okButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  okButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  instructionContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#1E40AF',
    flex: 1,
    fontWeight: '500',
  },
  proceedButton: {
    flex: 2,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});