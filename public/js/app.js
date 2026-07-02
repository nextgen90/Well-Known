// WatchPay client side JS

document.addEventListener('DOMContentLoaded', () => {
    // 1. Live Digital Clock
    const clockElement = document.getElementById('live-clock');
    if (clockElement) {
        function updateClock() {
            const now = new Date();
            let hours = now.getHours();
            let minutes = now.getMinutes();
            let seconds = now.getSeconds();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            hours = hours < 10 ? '0' + hours : hours;
            minutes = minutes < 10 ? '0' + minutes : minutes;
            seconds = seconds < 10 ? '0' + seconds : seconds;
            
            clockElement.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
        }
        updateClock();
        setInterval(updateClock, 1000);
    }

    // 2. Toast Dismissal
    const toast = document.getElementById('toast');
    if (toast) {
        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s ease';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    // 3. Password Toggle Visibility
    const togglePasswordBtn = document.getElementById('toggle-password');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const passwordInput = document.getElementById('password');
            if (passwordInput) {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                // toggle icon/eye styling if needed
                const eyeIcon = togglePasswordBtn.querySelector('i');
                if (eyeIcon && window.lucide) {
                    const isVisible = type === 'text';
                    eyeIcon.setAttribute('data-lucide', isVisible ? 'eye-off' : 'eye');
                    lucide.createIcons();
                }
            }
        });
    }

    // 4. Amount Chip Selection (Deposit / Withdraw pages)
    const chips = document.querySelectorAll('.chip');
    const amountInput = document.getElementById('amount');
    
    if (chips.length > 0 && amountInput) {
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                // remove active class from all
                chips.forEach(c => c.classList.remove('active'));
                // add to clicked
                chip.classList.add('active');
                
                // Get amount value
                const valueStr = chip.getAttribute('data-value');
                if (valueStr) {
                    amountInput.value = valueStr;
                }
            });
        });
        
        // Remove active class from chips if user types custom amount
        amountInput.addEventListener('input', () => {
            chips.forEach(c => c.classList.remove('active'));
        });
    }

    // 5. Multi-step Account Addition Form
    const accountForm = document.getElementById('add-account-form');
    if (accountForm) {
        let currentStep = 1;
        const totalSteps = 5;

        const nextButtons = document.querySelectorAll('.btn-next');
        const prevButtons = document.querySelectorAll('.btn-prev');
        const stepIndicators = document.querySelectorAll('.step-indicator');
        const stepContents = document.querySelectorAll('.step-content');

        // Select Account Type Card logic (Step 1)
        const typeCards = document.querySelectorAll('.selection-card');
        const selectedTypeInput = document.getElementById('selected-account-type');

        typeCards.forEach(card => {
            card.addEventListener('click', () => {
                typeCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const typeVal = card.getAttribute('data-type');
                selectedTypeInput.value = typeVal;
                
                // Set Bank details subheader based on account type
                const detailsSubheader = document.getElementById('details-subheader');
                if (detailsSubheader) {
                    detailsSubheader.textContent = `${typeVal} details`;
                }

                // Auto proceed to step 2 after brief delay
                setTimeout(() => {
                    goToStep(2);
                }, 300);
            });
        });

        function goToStep(step) {
            if (step < 1 || step > totalSteps) return;
            
            // Validate step before moving next
            if (step > currentStep) {
                if (!validateStep(currentStep)) return;
            }

            // Hide all steps
            stepContents.forEach(c => c.classList.remove('active'));
            
            // Show new step
            const activeContent = document.getElementById(`step-${step}`);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Update step indicators text
            const indicatorText = document.getElementById('indicator-text');
            if (indicatorText) {
                indicatorText.textContent = `Step ${step} of ${totalSteps}`;
            }

            // If Step 4 (Review), populate review summary
            if (step === 4) {
                document.getElementById('review-type').textContent = selectedTypeInput.value;
                document.getElementById('review-bank').textContent = document.getElementById('bank_name').value;
                document.getElementById('review-holder').textContent = document.getElementById('holder_name').value;
                document.getElementById('review-number').textContent = document.getElementById('account_number').value;
                document.getElementById('review-ifsc').textContent = document.getElementById('ifsc_code').value;
                document.getElementById('review-upi').textContent = document.getElementById('upi_id').value || 'Not provided';
            }

            currentStep = step;
        }

        function validateStep(step) {
            if (step === 1) {
                if (!selectedTypeInput.value) {
                    alert('Please select an account type to proceed.');
                    return false;
                }
            } else if (step === 2) {
                const bank = document.getElementById('bank_name').value.trim();
                const holder = document.getElementById('holder_name').value.trim();
                const num = document.getElementById('account_number').value.trim();
                const ifsc = document.getElementById('ifsc_code').value.trim();

                if (!bank || !holder || !num || !ifsc) {
                    alert('Please fill out all mandatory bank details.');
                    return false;
                }
            }
            return true;
        }

        // Add event listeners to buttons
        nextButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                goToStep(currentStep + 1);
            });
        });

        prevButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                goToStep(currentStep - 1);
            });
        });
        
        // Handle custom navigation back links
        const backLinks = document.querySelectorAll('.back-btn');
        backLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (currentStep > 1) {
                    e.preventDefault();
                    goToStep(currentStep - 1);
                }
            });
        });
    }

    // 6. Change Password Modal Toggle
    const changePassBtn = document.getElementById('change-password-menu-item');
    const modalOverlay = document.getElementById('change-password-modal');
    const cancelModalBtn = document.getElementById('cancel-change-password');
    
    if (changePassBtn && modalOverlay) {
        changePassBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modalOverlay.style.display = 'flex';
        });
        
        if (cancelModalBtn) {
            cancelModalBtn.addEventListener('click', () => {
                modalOverlay.style.display = 'none';
            });
        }
        
        // close when click outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }

    // 7. Auto transaction popup alert timers (for initial load ones)
    const popupCards = document.querySelectorAll('.auto-popup-card');
    popupCards.forEach((card, index) => {
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateY(-20px)';
            setTimeout(() => card.remove(), 500);
        }, 6000 + (index * 2000));
    });

    // 8. AJAX Live Polling for Dashboard Auto-Transactions (Continuous live feed @ 2/sec)
    const balanceDisplay = document.getElementById('balance-amount-display');
    const balanceCard = document.getElementById('balance-card-display');
    const autoStatsContainer = document.getElementById('auto-stats-container');
    const autoCreditVal = document.getElementById('auto-credit-val');
    const autoCreditBar = document.getElementById('auto-credit-bar');
    const autoDebitVal = document.getElementById('auto-debit-val');
    const autoDebitBar = document.getElementById('auto-debit-bar');
    const autoCountDisplay = document.getElementById('auto-count-display');
    const autoNetDisplay = document.getElementById('auto-net-display');
    const recentActivityList = document.getElementById('recent-activity-list');
    const emptyActivityFallback = document.getElementById('empty-activity-fallback');
    const notificationsContainer = document.getElementById('auto-notifications-container');

    if (balanceDisplay) {
        // Track transaction IDs we have already shown alerts for
        const displayedTxIds = new Set();
        
        // Add existing popups to the set so we don't duplicate
        document.querySelectorAll('.auto-popup-card').forEach(card => {
            // we will let them dismiss naturally
        });

        // Helper to animate balance value change smoothly
        function animateValue(obj, start, end, duration, prefix = '', suffix = '') {
            if (!obj) return;
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const currentVal = start + (progress * (end - start));
                obj.textContent = prefix + parseFloat(currentVal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                } else {
                    obj.textContent = prefix + parseFloat(end).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix;
                }
            };
            window.requestAnimationFrame(step);
        }

        // Helper to create and show popup notification (Compact Toast Alert)
        function showNotificationPopup(tx, balanceAfter) {
            if (!notificationsContainer) return;
            
            // Limit to maximum 3 notifications on screen so they don't cover the page
            const existingPopups = notificationsContainer.querySelectorAll('.auto-popup-card');
            if (existingPopups.length >= 3) {
                existingPopups[0].remove();
            }

            const card = document.createElement('div');
            card.className = 'auto-popup-card glass-card';
            card.style.cssText = `
                margin: 0 auto;
                pointer-events: auto;
                padding: 12px 14px;
                border-left: 4px solid ${tx.type === 'credit' ? 'var(--accent-teal)' : 'var(--danger)'};
                border-color: ${tx.type === 'credit' ? 'rgba(45,212,168,0.3)' : 'rgba(255,77,77,0.3)'};
                box-shadow: var(--shadow-lg);
                background: rgba(14, 20, 32, 0.95);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border-radius: var(--radius-md);
                border: 1px solid rgba(255,255,255,0.08);
                width: 330px;
                opacity: 0;
                transform: translateY(-20px);
                transition: all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            `;
            
            const formattedTime = new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const displayTitle = tx.bank_name || 'INDUSIND BANK';
            const displayAc = tx.account_number ? tx.account_number.slice(-4) : '2946';

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 22px; height: 22px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; display: flex; justify-content: center; align-items: center; color: var(--accent-teal);">
                            <i data-lucide="landmark" style="width: 12px; height: 12px;"></i>
                        </div>
                        <div style="display: flex; flex-direction: column; text-align: left;">
                            <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-primary);">${displayTitle}</span>
                            <span style="font-size: 0.55rem; color: var(--text-muted);">A/c XX${displayAc} · ${formattedTime}</span>
                        </div>
                    </div>
                    <i data-lucide="x" style="width: 12px; height: 12px; color: var(--text-muted); cursor: pointer;" onclick="this.parentElement.parentElement.remove()"></i>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="text-align: left;">
                        <div style="font-size: 0.65rem; font-weight: 700; color: ${tx.type === 'credit' ? 'var(--accent-teal)' : 'var(--danger)'}; display: flex; align-items: center; gap: 3px;">
                            <i data-lucide="${tx.type === 'credit' ? 'check' : 'x'}" style="width: 10px; height: 10px;"></i>
                            AMOUNT ${tx.type === 'credit' ? 'CREDITED' : 'DEBITED'}
                        </div>
                        <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 1px;">Sumit Kumar</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.05rem; font-weight: 800; font-family: var(--font-heading); color: ${tx.type === 'credit' ? 'var(--accent-teal)' : 'var(--danger)'};">
                            ${tx.type === 'credit' ? '+' : '-'}₹${parseFloat(tx.amount).toLocaleString('en-IN')}
                        </div>
                        <div style="font-size: 0.55rem; color: var(--text-muted); margin-top: 1px;">Avl. Balance: ₹${parseFloat(balanceAfter).toLocaleString('en-IN')}</div>
                    </div>
                </div>
            `;
            
            notificationsContainer.appendChild(card);
            
            if (window.lucide) {
                window.lucide.createIcons({
                    node: card
                });
            }

            // Animate slide-down
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 50);

            // Auto dismiss popup after 4 seconds
            setTimeout(() => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(-20px)';
                setTimeout(() => card.remove(), 400);
            }, 4000);
        }

        // Helper to prepend transaction to recent activity list
        function appendToActivityList(tx) {
            if (!recentActivityList) return;
            if (emptyActivityFallback) emptyActivityFallback.style.display = 'none';

            const item = document.createElement('div');
            item.className = 'activity-item';
            item.style.opacity = '0';
            item.style.transform = 'translateY(10px)';
            item.style.transition = 'all 0.4s ease';

            const isPlus = tx.type === 'deposit' || tx.type === 'credit';
            const iconName = isPlus ? 'arrow-down-left' : 'arrow-up-right';

            item.innerHTML = `
                <div class="activity-desc">
                    <div class="activity-icon-box ${tx.type}">
                        <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
                    </div>
                    <div class="activity-details">
                        <span class="activity-name" style="text-transform: capitalize; font-size: 0.85rem; font-weight: 600;">${tx.type} · Sumit Kumar</span>
                        <span class="activity-time">
                            ${tx.status === 'Auto' ? 'Auto · ' : ''}Just now
                        </span>
                    </div>
                </div>
                <div class="activity-amount-box">
                    <span class="activity-amount ${isPlus ? 'deposit' : 'withdrawal'}" style="font-size: 1rem; font-family: var(--font-heading); font-weight: 700;">
                        ${isPlus ? '+' : '-'}₹${parseFloat(tx.amount).toLocaleString('en-IN')}
                    </span>
                </div>
            `;

            recentActivityList.insertBefore(item, recentActivityList.firstChild);
            
            if (window.lucide) {
                window.lucide.createIcons({
                    node: item
                });
            }

            setTimeout(() => {
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, 50);

            // Limit list to last 5 items
            const currentItems = recentActivityList.querySelectorAll('.activity-item');
            if (currentItems.length > 5) {
                currentItems[currentItems.length - 1].remove();
            }
        }

        // Poll Live Data Function
        let lastKnownBalance = null;
        
        async function pollLiveData() {
            try {
                const response = await fetch('/api/live-data');
                if (!response.ok) return;
                const data = await response.json();

                // 1. Synchronous Balance state updates (only fallback if no new transactions are active)
                const newBalance = parseFloat(data.balance);
                if (lastKnownBalance === null) {
                    lastKnownBalance = newBalance;
                }

                // 2. Auto Stats updates
                if (data.autoStats && data.autoStats.count > 0) {
                    if (autoStatsContainer) {
                        autoStatsContainer.style.display = 'block';
                    }
                    
                    const statusText = document.getElementById('summary-status-text');
                    if (statusText) {
                        statusText.innerHTML = `Auto transactions running. <strong>${data.autoStats.count}</strong> transactions processed today.`;
                    }

                    if (autoCreditVal) autoCreditVal.textContent = '+₹' + parseFloat(data.autoStats.total_credit).toLocaleString('en-IN');
                    if (autoDebitVal) autoDebitVal.textContent = '-₹' + parseFloat(data.autoStats.total_debit).toLocaleString('en-IN');
                    if (autoCountDisplay) autoCountDisplay.textContent = `${data.autoStats.count} auto transactions today`;
                    
                    const netColor = data.autoStats.net >= 0 ? 'var(--accent-teal)' : 'var(--danger)';
                    const netPrefix = data.autoStats.net >= 0 ? '+' : '';
                    if (autoNetDisplay) {
                        autoNetDisplay.style.color = netColor;
                        autoNetDisplay.textContent = `Net ${netPrefix}₹` + parseFloat(data.autoStats.net).toLocaleString('en-IN');
                    }

                    const pctCredit = Math.min(100, (data.autoStats.total_credit / (data.autoStats.total_credit + data.autoStats.total_debit || 1)) * 100);
                    const pctDebit = Math.min(100, (data.autoStats.total_debit / (data.autoStats.total_credit + data.autoStats.total_debit || 1)) * 100);
                    if (autoCreditBar) autoCreditBar.style.width = `${pctCredit}%`;
                    if (autoDebitBar) autoDebitBar.style.width = `${pctDebit}%`;
                }

                // 3. Process new auto transactions for alerts, activity feed, and live balance counters
                if (data.recentAutoTx && data.recentAutoTx.length > 0) {
                    const newTxList = data.recentAutoTx.filter(tx => !displayedTxIds.has(tx.id));
                    
                    if (displayedTxIds.size === 0) {
                        // On first load, populate set with current live transaction IDs
                        data.recentAutoTx.forEach(tx => displayedTxIds.add(tx.id));
                    } else if (newTxList.length > 0) {
                        newTxList.reverse();
                        
                        newTxList.forEach((tx, idx) => {
                            displayedTxIds.add(tx.id);
                            
                            // Increment/Decrement the client-side running balance
                            const amt = parseFloat(tx.amount);
                            if (tx.type === 'credit') {
                                lastKnownBalance += amt;
                            } else {
                                lastKnownBalance -= amt;
                            }
                            
                            const balanceAtThisTx = lastKnownBalance;
                            
                            setTimeout(() => {
                                showNotificationPopup(tx, balanceAtThisTx);
                                appendToActivityList(tx);
                                
                                // Update dashboard balance displays synchronously with the popup alert
                                if (balanceDisplay) {
                                    balanceDisplay.textContent = '₹' + parseFloat(balanceAtThisTx).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                }
                                if (balanceCard) {
                                    balanceCard.textContent = '₹' + parseFloat(balanceAtThisTx).toLocaleString('en-IN');
                                }
                            }, idx * 330); // 330ms staggered delay
                        });
                    } else {
                        // If no new transactions to display, ensure balance numbers are strictly aligned with DB
                        if (Math.abs(newBalance - lastKnownBalance) > 0.01) {
                            lastKnownBalance = newBalance;
                            if (balanceDisplay) {
                                balanceDisplay.textContent = '₹' + parseFloat(newBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            }
                            if (balanceCard) {
                                balanceCard.textContent = '₹' + parseFloat(newBalance).toLocaleString('en-IN');
                            }
                        }
                    }
                } else {
                    // Fallback simple sync
                    if (Math.abs(newBalance - lastKnownBalance) > 0.01) {
                        lastKnownBalance = newBalance;
                        if (balanceDisplay) {
                            balanceDisplay.textContent = '₹' + parseFloat(newBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                        if (balanceCard) {
                            balanceCard.textContent = '₹' + parseFloat(newBalance).toLocaleString('en-IN');
                        }
                    }
                }
            } catch (err) {
                // fail silently
            }
        }

        // Initialize values
        if (balanceDisplay) {
            const rawVal = balanceDisplay.textContent.replace(/[^\d.]/g, '');
            lastKnownBalance = parseFloat(rawVal) || 0;
        }

        // Start Polling every 3 seconds
        setInterval(pollLiveData, 3000);
        
        // Initial immediate poll
        pollLiveData();
    }
});
